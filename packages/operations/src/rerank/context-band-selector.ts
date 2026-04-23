import type { RerankBand } from "@cat/shared/schema/rerank";

type PositiveSignals = {
  sourceOverlap: number;
  targetOverlap: number;
  conceptOverlap?: number;
};

type SelectContextBandInput<T> = {
  queryText: string;
  ranked: T[];
  getCandidateId: (candidate: T) => string;
  getConfidence: (candidate: T) => number;
  getPositiveSignals: (candidate: T) => PositiveSignals;
};

/**
 * Select a bounded ambiguous top cluster for context-route reranking.
 *
 * Anchors on the highest-ranked candidate. Extends the band only while
 * candidates remain locally plausible by deterministic proximity AND have
 * positive context evidence. Returns null when the cluster is not genuinely
 * ambiguous or the top candidate is clearly ahead.
 */
export const selectContextBand = <T>({
  ranked,
  getCandidateId,
  getConfidence,
  getPositiveSignals,
}: SelectContextBandInput<T>): RerankBand | null => {
  if (ranked.length < 2) return null;
  const anchor = ranked[0];
  const members = [anchor];

  for (const candidate of ranked.slice(1)) {
    const confidenceGap = getConfidence(anchor) - getConfidence(candidate);
    const signals = getPositiveSignals(candidate);
    const hasSupport =
      signals.sourceOverlap > 0 ||
      signals.targetOverlap > 0 ||
      (signals.conceptOverlap ?? 0) > 0;

    if (confidenceGap > 0.08 || !hasSupport) break;
    members.push(candidate);
  }

  if (members.length < 2) return null;
  return {
    start: 0,
    end: members.length,
    anchorCandidateId: getCandidateId(anchor),
    reasons: ["context-route ambiguous top cluster"],
  };
};
