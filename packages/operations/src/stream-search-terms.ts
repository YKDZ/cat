import type { OperationContext } from "@cat/domain";
import {
  TermRecallStreamEventSchema,
  type TermRecallStreamEvent,
} from "@cat/shared";
import * as z from "zod";

import {
  collectTermRecallOp,
  getTermRecallCandidates,
  TermRecallResultSchema,
} from "./collect-term-recall.ts";

export const StreamSearchTermsInputSchema = z.strictObject({
  glossaryIds: z.array(z.string()),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
  minConfidence: z.number().min(0).max(1).optional().default(0.6),
  maxAmount: z.int().min(1).optional().default(20),
});

export type StreamSearchTermsInput = z.input<
  typeof StreamSearchTermsInputSchema
>;

export const StreamSearchTermsEventSchema = TermRecallStreamEventSchema;
export type StreamSearchTermsEvent = TermRecallStreamEvent;

/** Stream ranked candidates followed by the complete typed recall result. */
export const streamSearchTermsOp = async function* (
  data: StreamSearchTermsInput,
  ctx?: OperationContext,
): AsyncGenerator<StreamSearchTermsEvent, void, unknown> {
  const input = StreamSearchTermsInputSchema.parse(data);
  const result = TermRecallResultSchema.parse(
    await collectTermRecallOp(
      {
        glossaryIds: input.glossaryIds,
        text: input.text,
        sourceLanguageId: input.sourceLanguageId,
        translationLanguageId: input.translationLanguageId,
        minSemanticSimilarity: input.minConfidence,
        maxAmount: input.maxAmount,
      },
      ctx,
    ),
  );
  for (const candidate of getTermRecallCandidates(result)) {
    if (candidate.confidence < input.minConfidence) continue;
    yield StreamSearchTermsEventSchema.parse({
      type: "CANDIDATE",
      candidate,
    });
  }
  yield StreamSearchTermsEventSchema.parse({ type: "COMPLETED", result });
};
