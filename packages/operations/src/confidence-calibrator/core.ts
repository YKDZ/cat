import type { RecallEvidence } from "@cat/shared";

import type { CalibrationSummary } from "./types";

const DEFAULT_BOOST_FACTOR = 2.5;
const MAX_CALIBRATED_CONFIDENCE = 0.85;

/**
 * @zh 对一批 evidence 中的 BM25 通道进行批次内归一化校准。
 *
 * 算法：
 * 1. 从所有 evidence 中收集 channel === "bm25" 的 confidence 作为 rawScore
 * 2. 计算 maxRaw = max(rawScores)
 * 3. 每个 BM25 evidence 的校准后置信度 = min(rawScore / maxRaw, 1.0) * boostFactor，上限 0.85
 * 4. 若 sparse evidence 命中率 >= 0.5，追加 multi-evidence 标记
 * @en Batch-normalize BM25-channel evidences within a result set.
 *
 * Algorithm:
 * 1. Collect all BM25 channel confidences as rawScores
 * 2. Compute maxRaw = max(rawScores)
 * 3. Calibrated confidence = min(rawScore / maxRaw, 1.0) * boostFactor, capped at 0.85
 * 4. If sparse evidence hit rate >= 0.5, append multi-evidence markup
 *
 * @param evidencesByCandidate - {@zh 每个候选的 evidence 数组列表} {@en List of evidence arrays per candidate}
 * @param boostFactor - {@zh 提升因子（默认 2.5）} {@en Boost factor (default 2.5)}
 * @returns - {@zh 校准后的 evidence 数组列表和摘要} {@en Calibrated evidence arrays and summary}
 */
export const calibrateBm25Confidence = (
  evidencesByCandidate: RecallEvidence[][],
  boostFactor = DEFAULT_BOOST_FACTOR,
): { calibrated: RecallEvidence[][]; summary: CalibrationSummary } => {
  // Collect all BM25 raw scores
  const bm25Scores: number[] = [];
  for (const evidences of evidencesByCandidate) {
    for (const ev of evidences) {
      if (ev.channel === "bm25") {
        bm25Scores.push(ev.confidence);
      }
    }
  }

  const summary: CalibrationSummary = {
    bm25Count: bm25Scores.length,
    maxRaw: 0,
    boostFactor,
    multiEvidenceCount: 0,
  };

  if (bm25Scores.length === 0) {
    return { calibrated: evidencesByCandidate, summary };
  }

  const maxRaw = Math.max(...bm25Scores);
  summary.maxRaw = maxRaw;

  // Fallback: if maxRaw is 0 or invalid, return unchanged
  if (!Number.isFinite(maxRaw) || maxRaw <= 0) {
    return { calibrated: evidencesByCandidate, summary };
  }

  const calibrate = (rawScore: number): number => {
    const normalized = Math.min(rawScore / maxRaw, 1.0);
    const boosted = normalized * boostFactor;
    return Math.min(boosted, MAX_CALIBRATED_CONFIDENCE);
  };

  const calibrated = evidencesByCandidate.map((evidences) => {
    const newEvidences = evidences.map((ev) => {
      if (ev.channel === "bm25") {
        return {
          ...ev,
          confidence: calibrate(ev.confidence),
          note: `${ev.note ?? ""} [calibrated: raw=${ev.confidence.toFixed(4)}, maxRaw=${maxRaw.toFixed(4)}, boost=${boostFactor}]`.trim(),
        };
      }
      return ev;
    });

    // Rule 3: if sparse content word hit >= 50%, append multi-evidence
    const sparseEv = evidences.find((e) => e.channel === "sparse");
    const bm25Ev = evidences.find((e) => e.channel === "bm25");
    if (bm25Ev && sparseEv && sparseEv.confidence >= 0.5) {
      const calibratedBm25 = newEvidences.find((e) => e.channel === "bm25");
      if (calibratedBm25) {
        newEvidences.push({
          channel: "multi",
          confidence: calibratedBm25.confidence,
          matchedText: bm25Ev.matchedText,
          note: "bm25+sparse multi-evidence",
        });
        summary.multiEvidenceCount += 1;
      }
    }

    return newEvidences;
  });

  return { calibrated, summary };
};
