// packages/operations/src/precision/types.ts
import type { TermMatch } from "@cat/shared";
import type { MemorySuggestion } from "@cat/shared";
import type {
  AmbiguityEnvelope,
  AnchorSignature,
  BudgetClass,
  CandidateTopicAssignment,
  MemoryTopicBinding,
  QueryProfile,
  QueryTopicHypothesis,
  RankingDecision,
} from "@cat/shared";
import type { RecallEvidence } from "@cat/shared";

// ─── Raw lane result (term side) ─────────────────────────────────
export type RawTermResult = {
  surface: "term";
  conceptId: number;
  glossaryId: string;
  term: string;
  translation: string;
  definition: string | null;
  confidence: number;
  matchedText?: string | undefined;
  evidences: RecallEvidence[];
};

// ─── Raw lane result (memory side) ───────────────────────────────
export type RawMemoryResult = {
  surface: "memory";
  id: number;
  memoryId: string;
  sourceScope?: "PROJECT" | "PERSONAL" | undefined;
  translationId?: number | null | undefined;
  sourceTemplate?: string | null | undefined;
  translationTemplate?: string | null | undefined;
  source: string;
  translation: string;
  confidence: number;
  matchedText?: string | undefined;
  matchedVariantText?: string | undefined;
  matchedVariantType?: string | undefined;
  adaptedTranslation?: string | undefined;
  adaptationMethod?: string | undefined;
  evidences: RecallEvidence[];
  // For pipeline use — not returned to callers
  topicBinding?: MemoryTopicBinding | undefined;
};

export type RawResult = RawTermResult | RawMemoryResult;

// ─── Candidate inside the precision pipeline ──────────────────────
export type RecallCandidate = RawResult & {
  budgetClass?: BudgetClass | undefined;
  topicAssignment?: CandidateTopicAssignment | undefined;
  anchorSignature?: AnchorSignature | undefined;
  rankingDecisions: RankingDecision[];
  /** Tier assigned by DeterministicLayeredRanker. */
  tier?: "1" | "2" | "3" | undefined;
  /** Hard-filtered candidates are removed from the result list. */
  hardFiltered?: boolean | undefined;
  hardFilterReason?: string | undefined;
};

// ─── Pipeline execution context ───────────────────────────────────
export type PrecisionContext = {
  queryProfile: QueryProfile;
  queryTopicHypothesis: QueryTopicHypothesis;
  /** IDs of candidates that occupy Tier 1 (protected from model override). */
  tier1Ids: Set<string>;
  ambiguityEnvelope?: AmbiguityEnvelope;
};

/** Stable identity key for a candidate (uniquely distinguishes term/memory). */
export const candidateKey = (c: RawResult): string =>
  c.surface === "term" ? `term:${c.conceptId}` : `memory:${c.id}`;

// ─── Precision-annotated caller-facing types ──────────────────────
/** Term match extended with optional pipeline decision trace (for regression testing). */
export type TermMatchWithPrecision = TermMatch & {
  rankingDecisions?: RankingDecision[];
};

/** MemorySuggestion extended with optional pipeline decision trace (for regression testing). */
export type MemorySuggestionWithPrecision = MemorySuggestion & {
  rankingDecisions?: RankingDecision[];
};
