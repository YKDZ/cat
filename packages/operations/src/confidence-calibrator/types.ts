import type { RecallEvidence } from "@cat/shared";

/**
 * @zh 校准后的 BM25 evidence，含原始分数与归一化信息。
 * @en Calibrated BM25 evidence with raw score and normalization metadata.
 */
export interface CalibratedBm25Evidence {
  /** Original channel (preserved from input evidence). */
  channel: RecallEvidence["channel"];
  /** Original matched text. */
  matchedText?: string;
  /** Original variant text. */
  matchedVariantText?: string;
  /** Original variant type. */
  matchedVariantType?: string;
  /** Calibrated confidence (0-1). */
  confidence: number;
  /** Original BM25 raw score (the pre-calibration confidence from the evidence). */
  rawScore: number;
  /** The batch maxRaw used for normalization. */
  batchMaxRaw: number;
  /** Human-readable note. */
  note?: string;
}

/**
 * @zh 批次 BM25 校准结果摘要。
 * @en Summary of batch BM25 calibration.
 */
export interface CalibrationSummary {
  /** Number of BM25 evidences in the batch. */
  bm25Count: number;
  /** Maximum raw score in the batch. */
  maxRaw: number;
  /** Boost factor applied (default 2.5). */
  boostFactor: number;
  /** Number of evidences that received multi-evidence markup via sparse boost. */
  multiEvidenceCount: number;
}
