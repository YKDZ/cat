import { es } from "@cat/db";
import { TermRelation } from "@cat/shared";

export const insertTerms = async (...relations: TermRelation[]) => {
  await Promise.all(relations.map(insertTerm));
};

export const insertTerm = async (relation: TermRelation) => {
  const { Term: term, Translation: translation } = relation;

  if (!term || !translation) return;

  const indexName = `terms_${term.languageId.toLowerCase()}`;

  const isExits = await es.indices.exists({
    index: indexName,
  });

  if (!isExits) {
    await es.indices.create({
      index: indexName,
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

  await es.index({
    index: indexName,
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
  const tokens =
    (
      await es.indices.analyze({
        index: `terms_${languageId.toLowerCase()}`,
        text,
      })
    ).tokens?.map((token) => token.token) ?? [];
  return (
    await es.search<{
      value: string;
      translationId: number;
    }>({
      index: `terms_${languageId.toLowerCase()}`,
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
