import { es, prisma } from "@cat/db";
import { TermRelation } from "@cat/shared";

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
