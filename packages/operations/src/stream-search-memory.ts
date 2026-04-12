import type { OperationContext } from "@cat/domain";
import type { MemorySuggestion } from "@cat/shared/schema/misc";

import { AsyncMessageQueue } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import * as z from "zod";

import { collectMemoryRecallOp } from "./collect-memory-recall";

export const StreamSearchMemoryInputSchema = z.object({
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  memoryIds: z.array(z.uuidv4()),
  /** Chunk IDs for the source element (used by the semantic channel). */
  chunkIds: z.array(z.int()),
  minSimilarity: z.number().min(0).max(1).optional().default(0.72),
  maxAmount: z.int().min(1).optional().default(3),
});

export type StreamSearchMemoryInput = z.input<
  typeof StreamSearchMemoryInputSchema
>;

/**
 * @zh 流式翻译记忆搜索。
 *
 * 底层统一走 aggregated helper，合并 exact / trgm / variant / semantic
 * 通道与 template adaptation，再按排序后的结果顺序流式产出。
 * @en Streaming memory search backed by the aggregated recall helper.
 */
export const streamSearchMemoryOp = (
  data: StreamSearchMemoryInput,
  ctx?: OperationContext,
): AsyncIterable<MemorySuggestion> => {
  const queue = new AsyncMessageQueue<MemorySuggestion>();

  const run = async () => {
    const memories = await collectMemoryRecallOp(
      {
        ...data,
        minSimilarity: data.minSimilarity ?? 0.72,
        maxAmount: data.maxAmount ?? 3,
      },
      ctx,
    );

    for (const memory of memories) {
      queue.push(memory);
    }
  };

  void run()
    .catch((err: unknown) => {
      logger.withSituation("OP").error(err, "streamSearchMemoryOp failed");
    })
    .finally(() => {
      queue.close();
    });

  return queue.consume();
};
