import { executeQuery, listDocumentElementsWithChunkIds } from "@cat/domain";
import * as z from "zod/v4";

import { withAgentDb } from "@/db/domain";
import { defineNode, defineTypedGraph } from "@/graph/typed-dsl";
import { runGraph } from "@/graph/typed-dsl/run-graph";

import {
  AutoTranslateConfigSchema,
  autoTranslateGraph,
} from "./auto-translate";

// ─── Input / Output Schemas ───────────────────────────────────────────────────

export const BatchAutoTranslateInputSchema = z.object({
  documentId: z.uuidv4(),
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
      chunkIds: z.array(z.int()),
    }),
  ),
  documentId: z.uuidv4(),
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

// ─── Document 级批量自动翻译图 ─────────────────────────────────────────────────

export const batchAutoTranslateGraph = defineTypedGraph({
  id: "batch-auto-translate",
  version: "1.0.0",
  description: "文档级批量自动翻译",

  input: BatchAutoTranslateInputSchema,
  output: BatchAutoTranslateOutputSchema,

  nodes: {
    "load-elements": defineNode({
      input: z.object({ documentId: z.uuidv4() }),
      output: LoadElementsOutputSchema,
      inputMapping: {
        documentId: "documentId",
      },
      handler: async (input, _ctx) => {
        const elements = await withAgentDb(async (db) =>
          executeQuery({ db }, listDocumentElementsWithChunkIds, {
            documentId: input.documentId,
          }),
        );
        return { elements };
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
        documentId: "documentId",
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

        for (const element of input.elements) {
          // 尊重外部取消信号，提前退出
          if (ctx.signal?.aborted) break;

          let result: { translationIds?: number[] };
          try {
            // oxlint-disable-next-line no-await-in-loop
            result = await runGraph(
              autoTranslateGraph,
              {
                translatableElementId: element.id,
                text: element.value,
                translationLanguageId: input.languageId,
                sourceLanguageId: element.languageId,
                translatorId: input.translatorId,
                advisorId: input.advisorId,
                memoryIds: input.memoryIds,
                glossaryIds: input.glossaryIds,
                chunkIds: element.chunkIds,
                minMemorySimilarity: input.minMemorySimilarity,
                maxMemoryAmount: input.maxMemoryAmount,
                memoryVectorStorageId: input.memoryVectorStorageId,
                translationVectorStorageId: input.translationVectorStorageId,
                vectorizerId: input.vectorizerId,
                documentId: input.documentId,
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
