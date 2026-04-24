// packages/shared/src/schema/precision-recall.ts
import * as z from "zod";

import { RerankBandSchema } from "@/schema/rerank.ts";

// ─── Evidence Lane ────────────────────────────────────────────────
/** Fine-grained retrieval lane inside the Fusion Ledger. */
export const EvidenceLaneValues = [
  "exact",
  "trgm",
  "lexical",
  "morphological",
  "sparse",
  "template",
  "fragment",
  "bm25",
  "semantic",
] as const;
export const EvidenceLaneSchema = z.enum(EvidenceLaneValues);
export type EvidenceLane = (typeof EvidenceLaneValues)[number];

// ─── Query Profile ────────────────────────────────────────────────
export const QueryProfileSchema = z.object({
  /** Trimmed token count (word-boundary split). */
  tokenCount: z.int().min(0),
  /** Fraction of non-stop, non-punct tokens. */
  contentWordDensity: z.number().min(0).max(1),
  /** True if query contains a number token. */
  hasNumericAnchor: z.boolean(),
  /** True if query contains a placeholder / variable token (e.g. %s, {0}). */
  hasPlaceholderAnchor: z.boolean(),
  /** True if query resembles a printf/template sentence. */
  isTemplateLike: z.boolean(),
  /** True when tokenCount <= 3 AND contentWordDensity >= 0.5. */
  isShortQuery: z.boolean(),
  /** True if query contains ≥1 obvious named-entity (ALL_CAPS or CamelCase). */
  hasEntityWord: z.boolean(),
});
export type QueryProfile = z.infer<typeof QueryProfileSchema>;

// ─── Budget Class ─────────────────────────────────────────────────
export const BudgetClassSchema = z.enum(["reserved", "competitive"]);
export type BudgetClass = z.infer<typeof BudgetClassSchema>;

// ─── Scope Envelope ───────────────────────────────────────────────
export const ScopeEnvelopeSchema = z.object({
  /** Glossary UUID for term candidates; memory UUID for memory candidates. */
  scopeId: z.string(),
  /** Surface this candidate originated from. */
  surface: z.enum(["term", "memory"]),
});
export type ScopeEnvelope = z.infer<typeof ScopeEnvelopeSchema>;

// ─── Candidate Topic Assignment ───────────────────────────────────
export const TopicMatchStateSchema = z.enum([
  "compatible",
  "conflict",
  "unknown",
]);
export type TopicMatchState = z.infer<typeof TopicMatchStateSchema>;

export const CandidateTopicAssignmentSchema = z.object({
  /** Canonical topic node ids this candidate maps to. Empty = unresolved. */
  topicIds: z.array(z.string()),
  /** How the assignment was determined. */
  source: z.enum([
    "term-subject",
    "memory-container-default",
    "memory-item-override",
    "inferred",
  ]),
  /** Match state relative to the current QueryTopicHypothesis. */
  matchState: TopicMatchStateSchema,
});
export type CandidateTopicAssignment = z.infer<
  typeof CandidateTopicAssignmentSchema
>;

// ─── Memory Topic Binding ─────────────────────────────────────────
export const MemoryTopicBindingSchema = z.object({
  /** Default topic from the memory container (memory/project). */
  containerDefault: z.array(z.string()),
  /** Override from the individual memory item, if any. */
  itemOverride: z.array(z.string()).optional(),
  /** Effective topics (itemOverride takes priority). */
  effective: z.array(z.string()),
});
export type MemoryTopicBinding = z.infer<typeof MemoryTopicBindingSchema>;

// ─── Query Topic Hypothesis ───────────────────────────────────────
export const QueryTopicConfidenceSchema = z.enum([
  "confident",
  "weak",
  "conflicting",
  "unknown",
]);
export type QueryTopicConfidence = z.infer<typeof QueryTopicConfidenceSchema>;

export const QueryTopicHypothesisSchema = z.object({
  topicIds: z.array(z.string()),
  confidence: QueryTopicConfidenceSchema,
  /** Human-readable explanation for how the hypothesis was formed. */
  note: z.string().optional(),
});
export type QueryTopicHypothesis = z.infer<typeof QueryTopicHypothesisSchema>;

// ─── Anchor Signature ────────────────────────────────────────────
export const AnchorSignatureSchema = z.object({
  queryNumbers: z.array(z.string()),
  queryPlaceholders: z.array(z.string()),
  candidateNumbers: z.array(z.string()),
  candidatePlaceholders: z.array(z.string()),
  /** True if numeric tokens in query are all present in candidate. */
  numbersCompatible: z.boolean(),
  /** True if placeholder tokens in query are all present in candidate. */
  placeholdersCompatible: z.boolean(),
});
export type AnchorSignature = z.infer<typeof AnchorSignatureSchema>;

// ─── Ranking Decision ─────────────────────────────────────────────
export const RankingDecisionSchema = z.object({
  tier: z.enum(["1", "2", "3"]).optional(),
  budgetClass: BudgetClassSchema.optional(),
  /** "hard-filter" | "topic-demotion" | "anchor-demotion" | "scope-filter" | "promoted" */
  action: z.string(),
  note: z.string(),
});
export type RankingDecision = z.infer<typeof RankingDecisionSchema>;

// ─── Ambiguity Envelope ───────────────────────────────────────────
export const AmbiguityEnvelopeSchema = z.object({
  /** Whether the model reranker should be invoked. */
  shouldInvokeModel: z.boolean(),
  /** Bounded slice of the ranked array that may be reordered by the model. */
  eligibleBand: RerankBandSchema,
});
export type AmbiguityEnvelope = z.infer<typeof AmbiguityEnvelopeSchema>;

// ─── Provider Status ─────────────────────────────────────────────
export const ProviderStatusSchema = z.object({
  /** Which optional capability this describes. */
  capability: z.enum([
    "sparse-lexical",
    "semantic",
    "taxonomy-registry",
    "query-topic-resolver",
    "model-reranker",
  ]),
  available: z.boolean(),
  degraded: z.boolean(),
  /** Non-null only when available=false or degraded=true. */
  reason: z.string().optional(),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;
