import type { JSONType } from "@cat/shared/schema/json";

import { getDrizzleDB } from "@cat/db";
import {
  executeQuery,
  getElementMeta,
  listConceptSubjectsByConceptIds,
  listLexicalTermSuggestions,
} from "@cat/domain";
import { TranslationAdviseSchema } from "@cat/shared/schema/plugin";
import { logger } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { firstOrGivenService, resolvePluginManager } from "@/utils";

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
  termExtractorId: z.int().optional().meta({
    description:
      "Plugin service ID of the TERM_EXTRACTOR to use for term spotting. Omit to use the default.",
  }),
  termRecognizerId: z.int().optional().meta({
    description:
      "Plugin service ID of the TERM_RECOGNIZER to use. Omit to use the default.",
  }),
});

export const FetchAdviseOutputSchema = z.object({
  suggestions: z.array(TranslationAdviseSchema),
});

export type FetchAdviseInput = z.infer<typeof FetchAdviseInputSchema>;
export type FetchAdviseOutput = z.infer<typeof FetchAdviseOutputSchema>;

/**
 * 获取翻译建议
 *
 * 通过 TRANSLATION_ADVISOR 插件服务获取机器翻译建议，
 * 支持术语表上下文注入、翻译记忆和元素上下文。
 */
export const fetchAdviseOp = async (
  data: FetchAdviseInput,
  ctx?: OperationContext,
): Promise<FetchAdviseOutput> => {
  const { client: drizzle } = await getDrizzleDB();
  const pluginManager = resolvePluginManager(ctx?.pluginManager);

  // Run term lookup, memory search, and element meta fetch in parallel
  const [lookedUpTerms, memorySuggestions, elementMeta] = await Promise.all([
    executeQuery({ db: drizzle }, listLexicalTermSuggestions, {
      text: data.text,
      sourceLanguageId: data.sourceLanguageId,
      translationLanguageId: data.translationLanguageId,
      glossaryIds: data.glossaryIds,
      wordSimilarityThreshold: 0.3,
    }),
    (async () => {
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

  // Batch-fetch concept subjects for all looked-up terms
  const uniqueConceptIds = [...new Set(lookedUpTerms.map((t) => t.conceptId))];
  const conceptSubjects = await executeQuery(
    { db: drizzle },
    listConceptSubjectsByConceptIds,
    {
      conceptIds: uniqueConceptIds,
    },
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

  // Map LookedUpTerm to the concept structure expected by GetSuggestionsContext
  const terms = lookedUpTerms.map((t) => ({
    term: t.term,
    translation: t.translation,
    concept: {
      subjects: subjectsMap.get(t.conceptId) ?? [],
      definition: t.definition,
    },
    confidence: t.confidence,
  }));

  const advisor = firstOrGivenService(
    pluginManager,
    "TRANSLATION_ADVISOR",
    data.advisorId,
  );

  if (!advisor) {
    logger.warn("WORKER", {
      msg: `Translation advisor service not found. No suggestion will be given.`,
    });
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
