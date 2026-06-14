import type { RecallEvidence } from "@cat/shared";

/**
 * Hard-negative removal reason categories.
 */
export type HardNegativeReason =
  | "cw-zero-intersection"
  | "length-ratio"
  | "isolated-semantic"
  | "tier3-isolated-semantic";

/**
 * Record of a hard-negative removal.
 */
export interface HardNegativeRemoval {
  /** Candidate surface type. */
  surface: "memory" | "term";
  /** Candidate key (memory id or term conceptId). */
  candidateKey: string;
  /** Reason for removal. */
  reason: HardNegativeReason;
  /** Which stage performed the removal. */
  stage: "pre-pipeline" | "post-pipeline";
  /** Human-readable detail. */
  detail?: string;
}

/**
 * Unified input interface for the HNF core rules engine.
 */
export interface HnfCandidate {
  /** Surface type. */
  surface: "memory" | "term";
  /** Stable candidate key. */
  candidateKey: string;
  /** Content words from the candidate's source/term text (lowercased). */
  candidateTextLower: string;
  /** Evidence array for this candidate. */
  evidences: RecallEvidence[];
  /** Current confidence. */
  confidence: number;
}

/**
 * Result of an HNF rule check.
 */
export interface HnfRuleResult {
  /** Whether the candidate passes (true = keep, false = remove). */
  pass: boolean;
  /** If not passing, the reason. */
  reason?: HardNegativeReason;
  /** If pass is true but confidence was modified, the new value. */
  modifiedConfidence?: number;
}
