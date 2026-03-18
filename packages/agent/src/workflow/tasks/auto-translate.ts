import type { JSONObject } from "@cat/shared/schema/json";

import * as z from "zod/v4";

import { defineGraphWorkflow } from "@/workflow/define-task";

import { createTranslationWorkflow } from "./create-translation";
import { fetchAdviseWorkflow } from "./fetch-advise";
import { searchMemoryWorkflow } from "./search-memory";

export const AutoTranslateInputSchema = z.object({
  translatableElementId: z.int(),
  text: z.string(),
  translationLanguageId: z.string(),
  sourceLanguageId: z.string(),
  translatorId: z.uuidv4().nullable(),
  advisorId: z.int().optional(),
  memoryIds: z.array(z.uuidv4()).default([]),
  glossaryIds: z.array(z.uuidv4()).default([]),
  chunkIds: z.array(z.int()).default([]),
  minMemorySimilarity: z.number().min(0).max(1),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorageId: z.int(),
  translationVectorStorageId: z.int(),
  vectorizerId: z.int(),
});

export const AutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()).optional(),
});

export const autoTranslateWorkflow = defineGraphWorkflow({
  name: "auto-translate",
  input: AutoTranslateInputSchema,
  output: AutoTranslateOutputSchema,
  cache: {
    enabled: true,
  },
  steps: async (payload, { traceId, signal }) => {
    return [
      fetchAdviseWorkflow.asStep(
        {
          text: payload.text,
          sourceLanguageId: payload.sourceLanguageId,
          translationLanguageId: payload.translationLanguageId,
          advisorId: payload.advisorId,
          glossaryIds: payload.glossaryIds,
        },
        { traceId, signal, stepId: "advise" },
      ),
      searchMemoryWorkflow.asStep(
        {
          chunkIds: payload.chunkIds,
          memoryIds: payload.memoryIds,
          sourceLanguageId: payload.sourceLanguageId,
          translationLanguageId: payload.translationLanguageId,
          minSimilarity: payload.minMemorySimilarity,
          maxAmount: payload.maxMemoryAmount,
          vectorStorageId: payload.memoryVectorStorageId,
        },
        { traceId, signal, stepId: "memory" },
      ),
    ];
  },
  handler: async (payload, ctx) => {
    const [adviseResult] = ctx.getStepResult(fetchAdviseWorkflow, "advise");
    const [memoryResult] = ctx.getStepResult(searchMemoryWorkflow, "memory");

    const memory = memoryResult?.memories
      .sort((left, right) => right.confidence - left.confidence)
      .at(0);
    const suggestion = adviseResult?.suggestions
      .sort((left, right) => right.confidence - left.confidence)
      .at(0);

    let selectedText: string | undefined;
    let meta: JSONObject = {};

    if (memory) {
      selectedText = memory.translation;
      meta = { memoryId: memory.id, confidence: memory.confidence };
    } else if (suggestion) {
      selectedText = suggestion.translation;
      meta =
        payload.advisorId !== undefined ? { advisorId: payload.advisorId } : {};
    }

    if (!selectedText) {
      return {};
    }

    const { result } = await createTranslationWorkflow.run(
      {
        data: [
          {
            translatableElementId: payload.translatableElementId,
            languageId: payload.translationLanguageId,
            text: selectedText,
            meta,
          },
        ],
        memoryIds: [],
        vectorizerId: payload.vectorizerId,
        vectorStorageId: payload.translationVectorStorageId,
        translatorId: payload.translatorId,
      },
      {
        runId: ctx.runId,
        traceId: ctx.traceId,
        signal: ctx.signal,
        pluginManager: ctx.pluginManager,
      },
    );

    const taskResult = await result();
    return { translationIds: taskResult.translationIds };
  },
});
