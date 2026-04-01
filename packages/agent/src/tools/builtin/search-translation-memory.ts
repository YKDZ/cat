import {
  executeQuery,
  getDbHandle,
  getElementWithChunkIds,
  listMemoryIdsByProject,
} from "@cat/domain";
import { streamSearchMemoryOp } from "@cat/operations";
import * as z from "zod";

import { defineTool } from "@/tools/types";

const InputSchema = z.object({
  // 高层模式：通过 element 自动解析
  elementId: z
    .int()
    .optional()
    .meta({
      description:
        "Element ID to search memory for. When provided, source text, chunk IDs, " +
        "and memory bank IDs are resolved automatically from the project.",
    }),
  // 纯文本模式
  text: z
    .string()
    .optional()
    .meta({
      description:
        "Raw source text to search. Used when elementId is not available. " +
        "Requires memoryIds to be provided.",
    }),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  // 手动覆盖（均为 optional）
  memoryIds: z.array(z.uuidv4()).optional().meta({
    description:
      "Memory bank UUIDs. Auto-resolved from project when elementId is provided.",
  }),
  minSimilarity: z.number().min(0).max(1).optional().default(0.72),
  maxAmount: z.int().min(1).optional().default(5),
});

export const searchTranslationMemoryTool = defineTool({
  name: "search_translation_memory",
  description:
    "Search translation memory for similar previously-translated segments. " +
    "Provide elementId for automatic context resolution, or text + memoryIds for manual search. " +
    "Uses three channels: exact match → trigram similarity → vector semantic search.",
  parameters: InputSchema,
  execute: async (args, ctx) => {
    const { client: drizzle } = await getDbHandle();

    let text: string;
    let chunkIds: number[] = [];
    let memoryIds: string[];

    if (args.elementId !== undefined) {
      // 自动解析
      const element = await executeQuery(
        { db: drizzle },
        getElementWithChunkIds,
        { elementId: args.elementId },
      );
      if (element === null) return { memories: [] };
      text = element.value;
      chunkIds = element.chunkIds;

      if (args.memoryIds && args.memoryIds.length > 0) {
        memoryIds = args.memoryIds;
      } else {
        memoryIds = await executeQuery(
          { db: drizzle },
          listMemoryIdsByProject,
          { projectId: element.projectId },
        );
      }
    } else if (args.text) {
      text = args.text;
      memoryIds = args.memoryIds ?? [];
    } else {
      return { memories: [] };
    }

    if (memoryIds.length === 0) return { memories: [] };

    const stream = streamSearchMemoryOp(
      {
        text,
        sourceLanguageId: args.sourceLanguageId,
        translationLanguageId: args.translationLanguageId,
        memoryIds,
        chunkIds,
        minSimilarity: args.minSimilarity,
        maxAmount: args.maxAmount,
      },
      { traceId: ctx.traceId, signal: ctx.signal },
    );

    const memories = [];
    for await (const m of stream) {
      memories.push(m);
    }

    return { memories };
  },
});
