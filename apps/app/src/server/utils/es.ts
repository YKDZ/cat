import type { TermRelation } from "@cat/shared";
import type { TermStore } from "./term/term-store";
import type { TermFormatter } from "./term/term-formatter";
import type { TermIndexService } from "./term/term-index-service";
import type { TermMatcher } from "./term/term-matcher";
import { getEsDB, getPrismaDB } from "../db";

export const DefaultFormatter: TermFormatter = {
  format(originalText, matches) {
    let result = originalText;
    const sorted = matches.sort((a, b) => b.start - a.start);
    for (const { start, end, replacement } of sorted) {
      result = result.slice(0, start) + replacement + result.slice(end);
    }
    return result;
  },
};

export const EsTermIndexService: TermIndexService = {
  async ensureIndex(languageId: string) {
    const { client: es } = await getEsDB();
    const index = `terms_${languageId.toLowerCase()}`;
    const exists = await es.indices.exists({ index });
    if (!exists) {
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
  },

  async analyzeText(languageId, text) {
    const { client: es } = await getEsDB();
    const index = `terms_${languageId.toLowerCase()}`;
    const res = await es.indices.analyze({ index, text });
    return res.tokens?.map((t) => t.token) ?? [];
  },
};

export const FuzzyTermMatcher: TermMatcher = {
  async search(text, languageId) {
    const { client: es } = await getEsDB();
    const index = `terms_${languageId.toLowerCase()}`;
    const tokens = await EsTermIndexService.analyzeText(languageId, text);

    const res = await es.search<{
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
    });

    return res.hits.hits
      .map((hit) => hit._source)
      .filter((v): v is { translationId: number; value: string } =>
        Boolean(v?.translationId && v?.value),
      );
  },
};

export const EsTermStore: TermStore = {
  async insertTerm(relation: TermRelation) {
    const { client: es } = await getEsDB();
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
  },

  async insertTerms(...relations) {
    await Promise.all(relations.map(this.insertTerm));
  },

  async searchTerm(text, languageId) {
    const results = await FuzzyTermMatcher.search(text, languageId);
    return results.map((r) => r.translationId);
  },

  async termText(text, sourceLang, targetLang) {
    const { client: prisma } = await getPrismaDB();
    const matches = await FuzzyTermMatcher.search(text, sourceLang);
    const textLower = text.toLowerCase();
    const allMatches = [];

    for (const m of matches) {
      const term = m.value.toLowerCase();
      let i = 0;
      while ((i = textLower.indexOf(term, i)) !== -1) {
        allMatches.push({
          start: i,
          end: i + term.length,
          value: m.value,
          translationId: m.translationId,
        });
        i += term.length;
      }
    }

    const deduped = allMatches
      .sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start))
      .reduce<{ lastEnd: number; list: typeof allMatches }>(
        (acc, cur) => {
          if (cur.start >= acc.lastEnd) {
            acc.list.push(cur);
            acc.lastEnd = cur.end;
          }
          return acc;
        },
        { lastEnd: -1, list: [] },
      ).list;

    const ids = [...new Set(deduped.map((m) => m.translationId))];
    const relations = await prisma.termRelation.findMany({
      where: {
        Translation: { id: { in: ids }, languageId: targetLang },
        Term: { languageId: sourceLang },
      },
      select: {
        translationId: true,
        Translation: { select: { value: true } },
      },
    });

    const map = new Map<number, string>();
    for (const r of relations) {
      if (r.Translation?.value) map.set(r.translationId, r.Translation.value);
    }

    const formatted = DefaultFormatter.format(
      text,
      deduped.map((m) => ({
        start: m.start,
        end: m.end,
        value: m.value,
        replacement: map.get(m.translationId) ?? m.value,
      })),
    );

    return {
      translationIds: [...map.keys()],
      termedText: formatted,
    };
  },

  async init() {
    const { client: prisma } = await getPrismaDB();
    const langs = await prisma.language.findMany({ select: { id: true } });
    await Promise.all(
      langs.map(({ id }) => EsTermIndexService.ensureIndex(id.toLowerCase())),
    );
  },
};
