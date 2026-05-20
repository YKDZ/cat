import type { ScopeTranslationSeed } from "@cat/shared";

import { resolveOperationScopeElementsOp } from "@cat/operations";
import { OperationScopeSchema } from "@cat/shared";
import * as z from "zod";

import { defineNode, defineGraph } from "@/graph/dsl";
import { runGraph } from "@/graph/dsl/run-graph";

import {
  type AutoTranslateOutput,
  AutoTranslateConfigSchema,
  autoTranslateGraph,
} from "./auto-translate";

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

export const BatchAutoTranslateInputSchema = OperationScopeSchema.extend({
  languageId: z.string(),
  advisorId: z.int().optional(),
  minMemorySimilarity: z.number().min(0).max(1).default(0.72),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorageId: z.int(),
  translationVectorStorageId: z.int(),
  vectorizerId: z.int(),
  translatorId: z.uuidv4().nullable(),
  memoryIds: z.array(z.uuidv4()).default([]),
  glossaryIds: z.array(z.uuidv4()).default([]),
  config: AutoTranslateConfigSchema.optional(),
});

export const BatchAutoTranslateOutputSchema = z.object({
  translationIds: z.array(z.int()),
  elementCount: z.int(),
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
  advisorId: z.int().optional(),
  minMemorySimilarity: z.number().min(0).max(1),
  maxMemoryAmount: z.int().min(0),
  memoryVectorStorageId: z.int(),
  translationVectorStorageId: z.int(),
  vectorizerId: z.int(),
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
        branchId: true,
        contentNodeIds: true,
        elementIds: true,
        sortMode: true,
        languageId: true,
      }),
      output: LoadElementsOutputSchema,
      inputMapping: {
        projectId: "projectId",
        branchId: "branchId",
        contentNodeIds: "contentNodeIds",
        elementIds: "elementIds",
        sortMode: "sortMode",
        languageId: "languageId",
      },
      handler: async (input, ctx) => {
        const { elements } = await resolveOperationScopeElementsOp(
          {
            projectId: input.projectId,
            branchId: input.branchId,
            contentNodeIds: input.contentNodeIds,
            elementIds: input.elementIds,
            sortMode: input.sortMode,
            languageToId: input.languageId,
            statusFilter: "untranslated",
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
        advisorId: "advisorId",
        minMemorySimilarity: "minMemorySimilarity",
        maxMemoryAmount: "maxMemoryAmount",
        memoryVectorStorageId: "memoryVectorStorageId",
        translationVectorStorageId: "translationVectorStorageId",
        vectorizerId: "vectorizerId",
        translatorId: "translatorId",
        memoryIds: "memoryIds",
        glossaryIds: "glossaryIds",
        config: "config",
      },
      handler: async (input, ctx) => {
        const allTranslationIds: number[] = [];
        const scopeTranslationSeeds: ScopeTranslationSeed[] = [];

        for (const element of input.elements) {
          // 尊重外部取消信号，提前退出
          if (ctx.signal?.aborted) break;

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
                advisorId: input.advisorId,
                memoryIds: input.memoryIds,
                glossaryIds: input.glossaryIds,
                chunkIds: element.chunkIds,
                scopeTranslationSeeds: scopeTranslationSeeds
                  .filter((seed) => isSeedApplicableToElement(seed, element))
                  .slice(-MAX_SCOPE_TRANSLATION_SEEDS),
                minMemorySimilarity: input.minMemorySimilarity,
                maxMemoryAmount: input.maxMemoryAmount,
                memoryVectorStorageId: input.memoryVectorStorageId,
                translationVectorStorageId: input.translationVectorStorageId,
                vectorizerId: input.vectorizerId,
                config: input.config,
              },
              { signal: ctx.signal, pluginManager: ctx.pluginManager },
            );
          } catch (error) {
            // 将内层错误附加元素 ID，便于顶层日志定位具体失败的元素
            const msg = error instanceof Error ? error.message : String(error);
            throw new Error(
              `Element ${element.id} ("${element.value.slice(0, 40)}"): ${msg}`,
            );
          }

          if (result.translationIds) {
            allTranslationIds.push(...result.translationIds);
          }
          if (result.scopeTranslationSeed) {
            scopeTranslationSeeds.push(result.scopeTranslationSeed);
          }
        }

        return {
          translationIds: allTranslationIds,
          elementCount: input.elements.length,
        };
      },
    }),
  },

  edges: [{ from: "load-elements", to: "translate-all" }],
  entry: "load-elements",
  exit: ["translate-all"],
});
