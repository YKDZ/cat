import type { OperationContext } from "@cat/domain";
import {
  MemoryRecallStreamEventSchema,
  NormalizedLanguageIdSchema,
  type MemoryRecallStreamEvent,
} from "@cat/shared";
import * as z from "zod";

import {
  collectMemoryRecallOp,
  getMemoryRecallCandidates,
  MemoryRecallResultSchema,
} from "./collect-memory-recall.ts";

export const StreamSearchMemoryInputSchema = z.strictObject({
  text: z.string(),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
  memoryIds: z.array(z.uuidv4()),
  minSimilarity: z.number().min(0).max(1).optional().default(0.72),
  maxAmount: z.int().min(1).optional().default(3),
});

export type StreamSearchMemoryInput = z.input<
  typeof StreamSearchMemoryInputSchema
>;

export const StreamSearchMemoryEventSchema = MemoryRecallStreamEventSchema;
export type StreamSearchMemoryEvent = MemoryRecallStreamEvent;

/** Stream ranked candidates followed by the complete typed recall result. */
export const streamSearchMemoryOp = async function* (
  data: StreamSearchMemoryInput,
  ctx?: OperationContext,
): AsyncGenerator<StreamSearchMemoryEvent, void, unknown> {
  const input = StreamSearchMemoryInputSchema.parse(data);
  const result = MemoryRecallResultSchema.parse(
    await collectMemoryRecallOp(
      {
        ...input,
      },
      ctx,
    ),
  );
  for (const candidate of getMemoryRecallCandidates(result)) {
    yield StreamSearchMemoryEventSchema.parse({
      type: "CANDIDATE",
      candidate,
    });
  }
  yield StreamSearchMemoryEventSchema.parse({ type: "COMPLETED", result });
};
