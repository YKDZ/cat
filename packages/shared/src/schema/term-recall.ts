import * as z from "zod";

import { RankingDecisionSchema } from "#/schema/precision-recall.ts";
import { RecallEvidenceSchema } from "#/schema/recall.ts";
import {
  createCandidateRecallResultSchema,
  createCandidateStreamEventSchema,
} from "#/schema/recall.ts";

// ─── Term recall transport ────────────────────────────────────────

/** Flat term match used by persistence and display callers. */
export const TermMatchSchema = z.object({
  term: z.string(),
  translation: z.string(),
  definition: z.string().nullable(),
  conceptId: z.int(),
  glossaryId: z.string(),
  confidence: z.number().min(0).max(1),
  /** Recall evidence entries from all channels that matched this concept. */
  evidences: z.array(RecallEvidenceSchema).default([]),
  /** The text fragment that was actually matched (may be a variant). */
  matchedText: z.string().optional(),
});
export type TermMatch = z.infer<typeof TermMatchSchema>;

// ─── Enriched concept context ─────────────────────────────────────

/** Concept context attached by higher-level callers. */
export const ConceptContextSchema = z.object({
  subjects: z.array(
    z.object({
      name: z.string(),
      defaultDefinition: z.string().nullable(),
    }),
  ),
  definition: z.string().nullable(),
});
export type ConceptContext = z.infer<typeof ConceptContextSchema>;

/** Term match with concept context attached by an API route or Agent tool. */
export const EnrichedTermMatchSchema = TermMatchSchema.extend({
  concept: ConceptContextSchema,
});
export type EnrichedTermMatch = z.infer<typeof EnrichedTermMatchSchema>;

/**
 * A term candidate after recall has established its non-empty evidence set.
 *
 * TermMatch stays permissive for persistence and display. Recall transport
 * uses this stricter schema to preserve ranking decisions and evidence across
 * package and network boundaries.
 */
export const TermRecallCandidateSchema = TermMatchSchema.omit({
  evidences: true,
}).extend({
  evidences: z.tuple([RecallEvidenceSchema], RecallEvidenceSchema),
  rankingDecisions: z.array(RankingDecisionSchema).optional(),
});

export const TermRecallResultSchema = createCandidateRecallResultSchema(
  TermRecallCandidateSchema,
);
export const TermRecallStreamEventSchema = createCandidateStreamEventSchema(
  TermRecallCandidateSchema,
  TermRecallResultSchema,
);

export type TermRecallCandidate = z.infer<typeof TermRecallCandidateSchema>;
export type TermRecallResult = z.infer<typeof TermRecallResultSchema>;
export type TermRecallStreamEvent = z.infer<typeof TermRecallStreamEventSchema>;
