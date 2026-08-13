import * as z from "zod";

import { MemorySuggestionSchema } from "#/schema/misc.ts";
import { RankingDecisionSchema } from "#/schema/precision-recall.ts";
import {
  createCandidateRecallResultSchema,
  createCandidateStreamEventSchema,
  RecallEvidenceSchema,
} from "#/schema/recall.ts";

/**
 * A memory candidate after recall has established its non-empty evidence set.
 *
 * MemorySuggestion remains the permissive persistence and display shape. Recall
 * transport uses this stricter shape so successful candidates cannot cross a
 * package or network boundary without evidence.
 */
export const MemoryRecallCandidateSchema = MemorySuggestionSchema.omit({
  evidences: true,
}).extend({
  evidences: z.tuple([RecallEvidenceSchema], RecallEvidenceSchema),
  rankingDecisions: z.array(RankingDecisionSchema).optional(),
});

export const MemoryRecallResultSchema = createCandidateRecallResultSchema(
  MemoryRecallCandidateSchema,
);
export const MemoryRecallStreamEventSchema = createCandidateStreamEventSchema(
  MemoryRecallCandidateSchema,
  MemoryRecallResultSchema,
);

export type MemoryRecallCandidate = z.infer<typeof MemoryRecallCandidateSchema>;
export type MemoryRecallResult = z.infer<typeof MemoryRecallResultSchema>;
export type MemoryRecallStreamEvent = z.infer<
  typeof MemoryRecallStreamEventSchema
>;
