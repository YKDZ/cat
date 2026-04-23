import type {
  AmbiguityEnvelope,
  AnchorSignature,
  BudgetClass,
  CandidateTopicAssignment,
  MemoryTopicBinding,
  QueryProfile,
  QueryTopicHypothesis,
  RankingDecision,
} from "@cat/shared/schema/precision-recall";
// packages/operations/src/precision/types.ts
import type { RecallEvidence } from "@cat/shared/schema/recall";

// ─── Raw lane result (term side) ─────────────────────────────────
export type RawTermResult = {
  surface: "term";
  conceptId: number;
  glossaryId: string;
  term: string;
  translation: string;
  definition: string | null;
  confidence: number;
  matchedText?: string;
  evidences: RecallEvidence[];
};

// ─── Raw lane result (memory side) ───────────────────────────────
export type RawMemoryResult = {
  surface: "memory";
  id: number;
  memoryId: string;
  source: string;
  translation: string;
  confidence: number;
  matchedText?: string;
  matchedVariantText?: string;
  matchedVariantType?: string;
  adaptedTranslation?: string;
  adaptationMethod?: string;
  evidences: RecallEvidence[];
  // For pipeline use — not returned to callers
  topicBinding?: MemoryTopicBinding;
};

export type RawResult = RawTermResult | RawMemoryResult;

// ─── Candidate inside the precision pipeline ──────────────────────
export type RecallCandidate = RawResult & {
  budgetClass?: BudgetClass;
  topicAssignment?: CandidateTopicAssignment;
  anchorSignature?: AnchorSignature;
  rankingDecisions: RankingDecision[];
  /** Tier assigned by DeterministicLayeredRanker. */
  tier?: "1" | "2" | "3";
  /** Hard-filtered candidates are removed from the result list. */
  hardFiltered?: boolean;
  hardFilterReason?: string;
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
