import { es, prisma } from "@cat/db";
import type { TermRelation } from "@cat/shared";

export const insertTerms = async (...relations: TermRelation[]) => {
  await Promise.all(relations.map(insertTerm));
};

export const insertTerm = async (relation: TermRelation) => {
  const { Term: term, Translation: translation } = relation;

  if (!term || !translation) return;

  const index = `terms_${term.languageId.toLowerCase()}`;

  await es.index({
    index,
    document: {
      value: term.value,
      translationId: translation.id,
    },
  });
};

export const searchTerm = async (
  text: string,
  languageId: string,
): Promise<number[]> => {
  const index = `terms_${languageId.toLowerCase()}`;
  const tokens =
    (
      await es.indices.analyze({
        index,
        text,
      })
    ).tokens?.map((token) => token.token) ?? [];
  return (
    await es.search<{
      value: string;
      translationId: number;
    }>({
      index,
      query: {
        bool: {
          should: tokens.map((token) => ({
            match: {
              value: {
                query: token,
                operator: "and",
                fuzziness: 1,
                prefix_length: 1,
                max_expansions: 50,
                fuzzy_transpositions: true,
              },
            },
          })),
          minimum_should_match: 1,
        },
      },
    })
  ).hits.hits
    .map((hit) => hit._source?.translationId)
    .filter((id) => id !== undefined);
};

export const termText = async (
  text: string,
  sourceLanguageId: string,
  targetLanguageId: string,
): Promise<{ translationIds: number[]; termedText: string }> => {
  const index = `terms_${sourceLanguageId.toLowerCase()}`;

  const searchResponse = await es.search<{
    value: string;
    translationId: number;
  }>({
    index,
    _source: ["value", "translationId"],
    query: {
      match: {
        value: {
          query: text,
          operator: "or",
          fuzziness: 1,
          prefix_length: 1,
          max_expansions: 50,
          fuzzy_transpositions: true,
        },
      },
    },
    size: 16,
  });

  type Match = {
    start: number;
    end: number;
    value: string;
    translationId: number;
  };
  const matches: Match[] = [];

  for (const hit of searchResponse.hits.hits) {
    const term = hit._source?.value;
    const translationId = hit._source?.translationId;
    if (!term || !translationId) continue;

    const termLower = term.toLowerCase();
    const textLower = text.toLowerCase();

    let index = 0;
    while ((index = textLower.indexOf(termLower, index)) !== -1) {
      matches.push({
        start: index,
        end: index + term.length,
        value: term,
        translationId,
      });
      index += term.length;
    }
  }

  if (matches.length === 0) return { termedText: text, translationIds: [] };

  // 冲突去重：长优先、无重叠
  matches.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - b.start - (a.end - a.start); // 长度优先
  });

  const selected: Match[] = [];
  let lastEnd = -1;
  for (const match of matches) {
    if (match.start >= lastEnd) {
      selected.push(match);
      lastEnd = match.end;
    }
  }

  // 一次性查所有翻译
  const uniqueIds = [...new Set(selected.map((m) => m.translationId))];
  const relations = await prisma.termRelation.findMany({
    where: {
      Translation: {
        id: { in: uniqueIds },
        languageId: targetLanguageId,
      },
      Term: {
        languageId: sourceLanguageId,
      },
    },
    select: {
      translationId: true,
      Translation: {
        select: { value: true },
      },
    },
  });

  const translationMap = new Map<number, string>();
  for (const rel of relations) {
    if (rel.Translation?.value) {
      translationMap.set(rel.translationId, rel.Translation.value);
    }
  }

  // 替换：倒序处理避免偏移
  let termedText = text;
  const replacements = selected
    .map((m) => ({
      ...m,
      replacement: translationMap.get(m.translationId),
    }))
    .filter((r) => r.replacement)
    .sort((a, b) => b.start - a.start); // 倒序

  for (const { start, end, replacement } of replacements) {
    termedText =
      termedText.slice(0, start) + replacement + termedText.slice(end);
  }

  return {
    translationIds: [...new Set(replacements.map((r) => r.translationId))],
    termedText,
  };
};

export const testIndex = async (index: string) => {
  const isExits = await es.indices.exists({
    index,
  });

  if (!isExits) {
    await es.indices.create({
      index,
      settings: {
        analysis: {
          analyzer: {
            text_ngram: {
              type: "custom",
              tokenizer: "standard",
              filter: ["lowercase", "edge_ngram_2_10"],
            },
          },
          filter: {
            edge_ngram_2_10: {
              type: "edge_ngram",
              min_gram: 2,
              max_gram: 10,
            },
          },
        },
      },
      mappings: {
        properties: {
          value: {
            type: "text",
            fields: {
              keyword: { type: "keyword" },
              ngram: { type: "text", analyzer: "text_ngram" },
            },
          },
        },
      },
    });
  }
};

export const initESIndex = async () => {
  await Promise.all(
    (
      await prisma.language.findMany({
        select: {
          id: true,
        },
      })
    ).map(async ({ id }) => {
      return await testIndex(`terms_${id.toLowerCase()}`);
    }),
  );
};
