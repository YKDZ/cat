import type { RecallEvidence } from "@cat/shared";

/**
 * @zh 硬负例移除原因分类。
 * @en Hard-negative removal reason categories.
 */
export type HardNegativeReason =
  | "cw-zero-intersection"
  | "length-ratio"
  | "isolated-semantic"
  | "tier3-isolated-semantic";

/**
 * @zh 硬负例移除记录。
 * @en Record of a hard-negative removal.
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
 * @zh HNF 核心规则引擎的统一输入接口。
 * @en Unified input interface for the HNF core rules engine.
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
 * @zh HNF 规则检查结果。
 * @en Result of an HNF rule check.
 */
export interface HnfRuleResult {
  /** Whether the candidate passes (true = keep, false = remove). */
  pass: boolean;
  /** If not passing, the reason. */
  reason?: HardNegativeReason;
  /** If pass is true but confidence was modified, the new value. */
  modifiedConfidence?: number;
}
