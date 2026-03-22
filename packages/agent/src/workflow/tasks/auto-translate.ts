import type { JSONObject } from "@cat/shared/schema/json";

import * as z from "zod/v4";

import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import { createTranslationGraph } from "./create-translation";
import { fetchAdviseGraph } from "./fetch-advise";
import { searchMemoryGraph } from "./search-memory";

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

export const autoTranslateGraph = defineTypedGraph({
  id: "auto-translate",
  input: AutoTranslateInputSchema,
  output: AutoTranslateOutputSchema,
  nodes: {
    main: defineNode({
      input: AutoTranslateInputSchema,
      output: AutoTranslateOutputSchema,
      handler: async (input, ctx) => {
        const [adviseResult, memoryResult] = await Promise.all([
          runGraph(
            fetchAdviseGraph,
            {
              text: input.text,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
              advisorId: input.advisorId,
              glossaryIds: input.glossaryIds,
            },
            { signal: ctx.signal },
          ),
          runGraph(
            searchMemoryGraph,
            {
              chunkIds: input.chunkIds,
              memoryIds: input.memoryIds,
              sourceLanguageId: input.sourceLanguageId,
              translationLanguageId: input.translationLanguageId,
              minSimilarity: input.minMemorySimilarity,
              maxAmount: input.maxMemoryAmount,
              vectorStorageId: input.memoryVectorStorageId,
            },
            { signal: ctx.signal },
          ),
        ]);

        const memory = memoryResult.memories
          .sort((left, right) => right.confidence - left.confidence)
          .at(0);
        const suggestion = adviseResult.suggestions
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
            input.advisorId !== undefined ? { advisorId: input.advisorId } : {};
        }

        if (!selectedText) {
          return {};
        }

        const { translationIds } = await runGraph(
          createTranslationGraph,
          {
            data: [
              {
                translatableElementId: input.translatableElementId,
                languageId: input.translationLanguageId,
                text: selectedText,
                meta,
              },
            ],
            memoryIds: [],
            vectorizerId: input.vectorizerId,
            vectorStorageId: input.translationVectorStorageId,
            translatorId: input.translatorId,
          },
          { signal: ctx.signal },
        );

        return { translationIds };
      },
    }),
  },
  edges: [],
  entry: "main",
  exit: ["main"],
});

/** @deprecated use autoTranslateGraph */
export const autoTranslateWorkflow = autoTranslateGraph;
