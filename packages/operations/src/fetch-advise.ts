import type { OperationContext } from "@cat/domain";
import type { JSONType } from "@cat/shared/schema/json";

import { getDbHandle } from "@cat/domain";
import {
  executeQuery,
  getElementMeta,
  listConceptSubjectsByConceptIds,
  listLexicalTermSuggestions,
} from "@cat/domain";
import { firstOrGivenService, resolvePluginManager } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import { TranslationAdviseSchema } from "@cat/shared/schema/plugin";
import * as z from "zod";

import { streamSearchMemoryOp } from "./stream-search-memory";

export const FetchAdviseInputSchema = z.object({
  advisorId: z.int().optional().meta({
    description:
      "Plugin service ID of the TRANSLATION_ADVISOR to use. Omit to use the default.",
  }),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),

  elementId: z.int().optional().meta({
    description:
      "ID of the source translatable element. When provided, element metadata is fetched from DB.",
  }),

  glossaryIds: z.array(z.uuidv4()).default([]).meta({
    description:
      "UUIDs of glossaries to inject term context into the suggestion.",
  }),
  memoryIds: z.array(z.uuidv4()).default([]).meta({
    description:
      "UUIDs of translation memory banks to search for contextual matches.",
  }),
  /** Pre-fetched term context from termRecallOp. When provided, skips internal term DB queries. */
  preloadedTerms: z
    .array(
      z.object({
        term: z.string(),
        translation: z.string(),
        confidence: z.number(),
        definition: z.string().nullable(),
        concept: z.object({
          subjects: z.array(
            z.object({
              name: z.string(),
              defaultDefinition: z.string().nullable(),
            }),
          ),
          definition: z.string().nullable(),
        }),
      }),
    )
    .optional(),
  /** Pre-fetched memory suggestions. When provided, skips internal memory search. */
  preloadedMemories: z
    .array(
      z.object({
        source: z.string(),
        translation: z.string(),
        confidence: z.number(),
      }),
    )
    .optional(),
});

export const FetchAdviseOutputSchema = z.object({
  suggestions: z.array(TranslationAdviseSchema),
});

export type FetchAdviseInput = z.infer<typeof FetchAdviseInputSchema>;
export type FetchAdviseOutput = z.infer<typeof FetchAdviseOutputSchema>;

/**
 * @zh 获取机器翻译建议。
 *
 * 通过 TRANSLATION_ADVISOR 插件服务获取机器翻译建议，
 * 支持术语表上下文注入、翻译记忆和元素上下文。
 * 可通过 `preloadedTerms` / `preloadedMemories` 跳过内部 DB 查询。
 * @en Fetch machine-translation suggestions.
 *
 * Queries the TRANSLATION_ADVISOR plugin service for MT suggestions,
 * with optional glossary term injection, translation memory context,
 * and element metadata. Upstream callers can pass preloaded terms/memories
 * via `preloadedTerms` / `preloadedMemories` to skip internal DB queries.
 *
 * @param data - {@zh 翻译建议输入参数} {@en Translation advice input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 排序的翻译建议列表} {@en Sorted list of translation suggestions}
 */
export const fetchAdviseOp = async (
  data: FetchAdviseInput,
  ctx?: OperationContext,
): Promise<FetchAdviseOutput> => {
  const { client: drizzle } = await getDbHandle();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

  // Run term lookup, memory search, and element meta fetch in parallel.
  // Skip DB queries when preloaded data is provided from upstream nodes.
  const [terms, memorySuggestions, elementMeta] = await Promise.all([
    data.preloadedTerms
      ? Promise.resolve(
          data.preloadedTerms.map((t) => ({
            term: t.term,
            translation: t.translation,
            concept: t.concept,
            confidence: t.confidence,
          })),
        )
      : (async () => {
          const lookedUpTerms = await executeQuery(
            { db: drizzle },
            listLexicalTermSuggestions,
            {
              text: data.text,
              sourceLanguageId: data.sourceLanguageId,
              translationLanguageId: data.translationLanguageId,
              glossaryIds: data.glossaryIds,
              wordSimilarityThreshold: 0.3,
            },
          );

          const uniqueConceptIds = [
            ...new Set(lookedUpTerms.map((t) => t.conceptId)),
          ];
          const conceptSubjects = await executeQuery(
            { db: drizzle },
            listConceptSubjectsByConceptIds,
            { conceptIds: uniqueConceptIds },
          );
          const subjectsMap = new Map<
            number,
            { name: string; defaultDefinition: string | null }[]
          >();
          for (const row of conceptSubjects) {
            const existing = subjectsMap.get(row.conceptId);
            const subject = {
              name: row.name,
              defaultDefinition: row.defaultDefinition,
            };
            if (existing) {
              existing.push(subject);
            } else {
              subjectsMap.set(row.conceptId, [subject]);
            }
          }

          return lookedUpTerms.map((t) => ({
            term: t.term,
            translation: t.translation,
            concept: {
              subjects: subjectsMap.get(t.conceptId) ?? [],
              definition: t.definition,
            },
            confidence: t.confidence,
          }));
        })(),
    data.preloadedMemories
      ? Promise.resolve(data.preloadedMemories)
      : (async () => {
          if (data.memoryIds.length === 0) return [];
          const results: {
            source: string;
            translation: string;
            confidence: number;
          }[] = [];
          for await (const m of streamSearchMemoryOp({
            text: data.text,
            sourceLanguageId: data.sourceLanguageId,
            translationLanguageId: data.translationLanguageId,
            memoryIds: data.memoryIds,
            chunkIds: [],
          })) {
            results.push({
              source: m.source,
              translation: m.translation,
              confidence: m.confidence,
            });
          }
          return results;
        })(),
    data.elementId !== undefined
      ? executeQuery({ db: drizzle }, getElementMeta, {
          elementId: data.elementId,
        }).then((meta) => meta ?? {})
      : ({} as JSONType),
  ]);

  const advisor = firstOrGivenService(
    pluginManager,
    "TRANSLATION_ADVISOR",
    data.advisorId,
  );

  if (!advisor) {
    logger
      .withSituation("WORKER")
      .warn(
        `Translation advisor service ${data.advisorId} not found while no default service is available. No suggestion will be given.`,
      );
    return { suggestions: [] };
  }

  const suggestions = await advisor.service.advise({
    source: {
      text: data.text,
      languageId: data.sourceLanguageId,
      meta: elementMeta,
    },
    terms,
    memories: memorySuggestions,
    targetLanguageId: data.translationLanguageId,
  });

  return { suggestions };
};
