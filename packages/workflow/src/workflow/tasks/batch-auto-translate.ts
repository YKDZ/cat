import { resolveOperationScopeElementsOp } from "@cat/operations";
import type { ScopeTranslationSeed } from "@cat/shared";
import {
  AutoTranslateConfigSchema,
  BatchAutoTranslationInvocationSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import { defineNode, defineGraph } from "#/graph/dsl/index.ts";
import { runGraph } from "#/graph/dsl/run-graph.ts";

import {
  type AutoTranslateOutput,
  autoTranslateGraph,
} from "./auto-translate.ts";

const MAX_SCOPE_TRANSLATION_SEEDS = 8;

const tokenizeSeedText = (value: string): Set<string> =>
  new Set(
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [],
  );

const isSeedApplicableToElement = (
  seed: ScopeTranslationSeed,
  element: { value: string; primaryContentNodeId: string | null },
): boolean => {
  if (seed.confidence < 0.85 || seed.trustLevel === "LOW") return false;
  if (
    seed.primaryContentNodeId !== null &&
    seed.primaryContentNodeId === element.primaryContentNodeId
  ) {
    return true;
  }

  const seedTokens = tokenizeSeedText(seed.source);
  const elementTokens = tokenizeSeedText(element.value);
  if (seedTokens.size === 0 || elementTokens.size === 0) return false;

  let overlap = 0;
  for (const token of seedTokens) {
    if (elementTokens.has(token)) {
      overlap += 1;
    }
  }
  return overlap / seedTokens.size >= 0.5;
};

// ─── Input / Output Schemas ───────────────────────────────────────────────────

export const BatchAutoTranslateInputSchema =
  BatchAutoTranslationInvocationSchema;

export const BatchAutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()),
  translatedElementIds: z.array(z.int()),
  skippedElementIds: z.array(z.int()),
});

export type BatchAutoTranslateInput = z.infer<
  typeof BatchAutoTranslateInputSchema
>;
export type BatchAutoTranslateOutput = z.infer<
  typeof BatchAutoTranslateOutputSchema
>;

// ─── 中间节点 Schemas ─────────────────────────────────────────────────────────

const LoadElementsOutputSchema = z.object({
  elements: z.array(
    z.object({
      id: z.int(),
      value: z.string(),
      languageId: z.string(),
      primaryContentNodeId: z.uuidv4().nullable(),
      chunkIds: z.array(z.int()),
    }),
  ),
});

const TranslateAllNodeInputSchema = z.object({
  elements: z.array(
    z.object({
      id: z.int(),
      value: z.string(),
      languageId: z.string(),
      primaryContentNodeId: z.uuidv4().nullable(),
      chunkIds: z.array(z.int()),
    }),
  ),
  languageId: z.string(),
  advisor: ServiceImplementationReferenceSchema.optional(),
  minMemorySimilarity: z.number().min(0).max(1),
  maxMemoryAmount: z.int().min(0),
  memoryVectorStorage: ServiceImplementationReferenceSchema,
  translationVectorStorage: ServiceImplementationReferenceSchema,
  vectorizer: ServiceImplementationReferenceSchema,
  translatorId: z.uuidv4().nullable(),
  memoryIds: z.array(z.uuidv4()),
  glossaryIds: z.array(z.uuidv4()),
  config: AutoTranslateConfigSchema.optional(),
});

// ─── 范围级批量自动翻译图 ───────────────────────────────────────────────────────

export const batchAutoTranslateGraph = defineGraph({
  id: "batch-auto-translate",
  version: "1.0.0",
  description: "范围级批量自动翻译",

  input: BatchAutoTranslateInputSchema,
  output: BatchAutoTranslateOutputSchema,

  nodes: {
    "load-elements": defineNode({
      input: BatchAutoTranslateInputSchema.pick({
        projectId: true,
        contentNodeIds: true,
        elementIds: true,
        sortMode: true,
        languageId: true,
      }),
      output: LoadElementsOutputSchema,
      inputMapping: {
        projectId: "projectId",
        contentNodeIds: "contentNodeIds",
        elementIds: "elementIds",
        sortMode: "sortMode",
        languageId: "languageId",
      },
      handler: async (input, ctx) => {
        // A Task invocation is an exact element snapshot. In particular, an
        // empty snapshot is a valid no-op, never an implicit whole-project run.
        if (input.elementIds.length === 0) return { elements: [] };
        const { elements } = await resolveOperationScopeElementsOp(
          {
            projectId: input.projectId,
            contentNodeIds: [],
            elementIds: input.elementIds,
            sortMode: input.sortMode,
            languageToId: input.languageId,
            statusFilter: "all",
            exactElementIds: true,
          },
          { traceId: ctx.runId, signal: ctx.signal },
        );

        return {
          elements: elements.map((element) => ({
            id: element.id,
            value: element.value,
            languageId: element.languageId,
            primaryContentNodeId: element.primaryContentNodeId,
            chunkIds: element.chunkIds,
          })),
        };
      },
    }),

    "translate-all": defineNode({
      input: TranslateAllNodeInputSchema,
      output: BatchAutoTranslateOutputSchema,
      // 文档可能包含数百个元素，顺序处理每个元素的 auto-translate 子图
      // 需要远超默认 120s 的超时时间（此处设置 24h 作为实际无限超时）
      timeoutMs: 24 * 60 * 60 * 1000,
      inputMapping: {
        elements: "load-elements.elements",
        languageId: "languageId",
        advisor: "advisor",
        minMemorySimilarity: "minMemorySimilarity",
        maxMemoryAmount: "maxMemoryAmount",
        memoryVectorStorage: "memoryVectorStorage",
        translationVectorStorage: "translationVectorStorage",
        vectorizer: "vectorizer",
        translatorId: "translatorId",
        memoryIds: "memoryIds",
        glossaryIds: "glossaryIds",
        config: "config",
      },
      handler: async (input, ctx) => {
        const allTranslationIds: number[] = [];
        const translatedElementIds: number[] = [];
        const skippedElementIds: number[] = [];
        const scopeTranslationSeeds: ScopeTranslationSeed[] = [];

        for (const element of input.elements) {
          // 尊重外部取消信号，提前退出
          ctx.signal?.throwIfAborted();

          let result: AutoTranslateOutput;
          try {
            // oxlint-disable-next-line no-await-in-loop
            result = await runGraph(
              autoTranslateGraph,
              {
                translatableElementId: element.id,
                text: element.value,
                translationLanguageId: input.languageId,
                sourceLanguageId: element.languageId,
                primaryContentNodeId: element.primaryContentNodeId,
                translatorId: input.translatorId,
                advisor: input.advisor,
                memoryIds: input.memoryIds,
                glossaryIds: input.glossaryIds,
                chunkIds: element.chunkIds,
                scopeTranslationSeeds: scopeTranslationSeeds
                  .filter((seed) => isSeedApplicableToElement(seed, element))
                  .slice(-MAX_SCOPE_TRANSLATION_SEEDS),
                minMemorySimilarity: input.minMemorySimilarity,
                maxMemoryAmount: input.maxMemoryAmount,
                memoryVectorStorage: input.memoryVectorStorage,
                translationVectorStorage: input.translationVectorStorage,
                vectorizer: input.vectorizer,
                config: input.config,
              },
              {
                signal: ctx.signal,
                pluginManager: ctx.pluginManager,
                ownershipFence: ctx.ownershipFence,
                assertRunOwnership: ctx.assertRunOwnership,
                vcsContext: ctx.vcsContext,
                vcsMiddleware: ctx.vcsMiddleware,
              },
            );
          } catch (error) {
            // 将内层错误附加元素 ID，便于顶层日志定位具体失败的元素
            const msg = error instanceof Error ? error.message : String(error);
            const contextualError = new Error(
              `Element ${element.id} ("${element.value.slice(0, 40)}"): ${msg}`,
              { cause: error },
            );
            const operationFailure =
              typeof error === "object" && error !== null
                ? Reflect.get(error, "operationFailure")
                : undefined;
            if (operationFailure !== undefined) {
              Object.assign(contextualError, { operationFailure });
            }
            throw contextualError;
          }

          if (result.translationIds) {
            allTranslationIds.push(...result.translationIds);
          }
          if (result.translationIds && result.translationIds.length > 0) {
            translatedElementIds.push(element.id);
          } else {
            skippedElementIds.push(element.id);
          }
          if (result.scopeTranslationSeed) {
            scopeTranslationSeeds.push(result.scopeTranslationSeed);
          }

          // oxlint-disable-next-line no-await-in-loop
          await ctx.emit({
            type: "workflow:task:progress",
            payload: {
              current: translatedElementIds.length + skippedElementIds.length,
              total: input.elements.length,
              phase: "TRANSLATING",
              translationIds: [...allTranslationIds],
              translatedElementIds: [...translatedElementIds],
              skippedElementIds: [...skippedElementIds],
            },
          });
        }

        return {
          translationIds: allTranslationIds,
          translatedElementIds,
          skippedElementIds,
        };
      },
    }),
  },

  edges: [{ from: "load-elements", to: "translate-all" }],
  entry: "load-elements",
  exit: ["translate-all"],
});
