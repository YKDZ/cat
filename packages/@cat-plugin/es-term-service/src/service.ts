import {
  getDrizzleDB,
  termRelation,
  eq,
  and,
  inArray,
  term,
  translatableString,
  aliasedTable,
  language,
} from "@cat/db";
import type {
  TermFormatter,
  TermIndexer,
  TermMatcher,
  TermService,
  TermStore,
} from "@cat/plugin-core";
import { Client } from "@elastic/elasticsearch";
import * as z from "zod/v4";

const ConnectionConfigSchema = z.object({
  url: z.url(),
  username: z.string(),
  password: z.string(),
});

export const ConfigSchema = z.object({
  connection: ConnectionConfigSchema,
});

type Config = z.infer<typeof ConfigSchema>;

export const getESTermService = (config: Config): TermService => {
  const es = new Client({
    node: config.connection.url,
    auth: {
      username: config.connection.username || "elastic",
      password: config.connection.password || "elastic",
    },
    tls: {
      rejectUnauthorized: false,
    },
  });

  const Formatter: TermFormatter = {
    format(originalText, matches) {
      let result = originalText;
      const sorted = matches.sort((a, b) => b.start - a.start);
      for (const { start, end, replacement } of sorted) {
        result = result.slice(0, start) + replacement + result.slice(end);
      }
      return result;
    },
  };

  const Indexer: TermIndexer = {
    async ensureIndex(languageId: string) {
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
      const index = `terms_${languageId.toLowerCase()}`;
      const res = await es.indices.analyze({ index, text });
      return res.tokens?.map((t) => t.token) ?? [];
    },
  };

  const Matcher: TermMatcher = {
    async search(text, languageId) {
      const index = `terms_${languageId.toLowerCase()}`;
      const tokens = await Indexer.analyzeText(languageId, text);

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

  const Store: TermStore = {
    async insertTerms(relations) {
      await Promise.all(
        relations.map(async (relation) => {
          if (!relation.term || !relation.translationId) return;
          const index = `terms_${relation.termLanguageId.toLowerCase()}`;
          await es.index({
            index,
            document: {
              value: relation.term,
              translationId: relation.translationId,
            },
          });
        }),
      );
    },

    async searchTerm(text, languageId) {
      const results = await Matcher.search(text, languageId);
      return results.map((r) => r.translationId);
    },

    async termText(text, sourceLang, targetLang) {
      const { client: drizzle } = await getDrizzleDB();
      const matches = await Matcher.search(text, sourceLang);
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
        .sort(
          (a, b) => a.start - b.start || b.end - b.start - (a.end - a.start),
        )
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

      const sourceTerm = aliasedTable(term, "sourceTerm");
      const translationTerm = aliasedTable(term, "translationTerm");
      const sourceString = aliasedTable(translatableString, "sourceString");
      const translationString = aliasedTable(
        translatableString,
        "translatableString",
      );
      const relations = await drizzle
        .select({
          translationId: termRelation.translationId,
          translation: translationString.value,
        })
        .from(termRelation)
        .innerJoin(sourceTerm, eq(sourceTerm.id, termRelation.termId))
        .innerJoin(
          translationTerm,
          eq(translationTerm.id, termRelation.translationId),
        )
        .innerJoin(
          sourceString,
          and(
            eq(sourceString.id, sourceTerm.stringId),
            eq(sourceString.languageId, sourceLang),
          ),
        )
        .innerJoin(
          translationString,
          and(
            eq(translationString.id, translationTerm.stringId),
            eq(translationString.languageId, targetLang),
          ),
        )
        .where(and(inArray(termRelation.translationId, ids)));

      const map = new Map<number, string>(
        relations.map((r) => [r.translationId, r.translation]),
      );

      const formatted = Formatter.format(
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
      const { client: drizzle } = await getDrizzleDB();
      const langs = await drizzle
        .select({
          id: language.id,
        })
        .from(language);
      await Promise.all(
        langs.map(async ({ id }) => Indexer.ensureIndex(id.toLowerCase())),
      );
    },
  };

  return {
    getId() {
      return "ES";
    },
    termFormatter: Formatter,
    termIndexer: Indexer,
    termMatcher: Matcher,
    termStore: Store,
  } satisfies TermService;
};
