// packages/operations/src/precision/ambiguity-gate.ts
import type {
  AmbiguityEnvelope,
  QueryTopicHypothesis,
} from "@cat/shared/schema/precision-recall";

import type { RecallCandidate } from "./types";

const TIER1_SCORE_GAP_THRESHOLD = 0.05;

/** True when a candidate is a protected Tier-1 winner (no recoverable conflict). */
function isClearTier1(c: RecallCandidate): boolean {
  return (
    c.tier === "1" &&
    !c.rankingDecisions.some((d) => d.action === "recoverable-demotion")
  );
}

/**
 * Evaluate four ambiguity rules:
 * 1. Top-tier confidence gap too small (< THRESHOLD between rank-0 and rank-1 in same tier).
 * 2. Top candidates' evidence families diverge (no shared channel at all).
 * 3. Query topic hypothesis is weak / conflicting / unknown AND anchors don't resolve.
 * 4. Top candidate has a recoverable-conflict decision note.
 *
 * Returns an AmbiguityEnvelope describing whether and where to invoke the model.
 * Clear Tier-1 winners (tier="1" and no recoverable-conflict) are EXCLUDED from the band.
 */
export function evaluateAmbiguity(
  ranked: RecallCandidate[],
  hypothesis: QueryTopicHypothesis,
): AmbiguityEnvelope {
  if (ranked.length === 0) {
    return {
      shouldInvokeModel: false,
      eligibleBand: { start: 0, end: 0 },
      reasons: [],
    };
  }

  const reasons: string[] = [];

  // ── Rule 1: confidence gap ───────────────────────────────────────
  // Clear Tier-1 winners are excluded: a dominant high-confidence Tier-1 match
  // should not be sent to the model just because a distant lower-tier candidate
  // happens to be within the gap threshold.
  const top = ranked[0];
  const second = ranked[1];
  if (
    second &&
    !isClearTier1(top) &&
    top.confidence - second.confidence < TIER1_SCORE_GAP_THRESHOLD
  ) {
    reasons.push(
      `confidence-gap: top=${top.confidence.toFixed(3)} second=${second.confidence.toFixed(3)}`,
    );
  }

  // ── Rule 2: evidence divergence ──────────────────────────────────
  // Skip when the top is a clear Tier-1 winner: different evidence families
  // between Tier-1 (exact/lexical) and Tier-2/3 (trgm/semantic) are expected.
  if (second && !isClearTier1(top)) {
    const topChannels = new Set(top.evidences.map((e) => e.channel));
    const secondChannels = new Set(second.evidences.map((e) => e.channel));
    const overlap = [...topChannels].filter((ch) => secondChannels.has(ch));
    if (overlap.length === 0) {
      reasons.push(
        "evidence-divergence: top-2 candidates share no evidence channel",
      );
    }
  }

  // ── Rule 3: topic uncertainty ────────────────────────────────────
  if (
    (hypothesis.confidence === "weak" ||
      hypothesis.confidence === "conflicting" ||
      hypothesis.confidence === "unknown") &&
    top.anchorSignature?.numbersCompatible !== true
  ) {
    reasons.push(`topic-uncertainty: query topic ${hypothesis.confidence}`);
  }

  // ── Rule 4: recoverable conflict on top candidate ────────────────
  const hasRecoverableConflict = top.rankingDecisions.some(
    (d) => d.action === "recoverable-demotion",
  );
  if (hasRecoverableConflict) {
    reasons.push(
      "recoverable-conflict: top candidate has unresolved conflict note",
    );
  }

  if (reasons.length === 0) {
    return {
      shouldInvokeModel: false,
      eligibleBand: { start: 0, end: 0 },
      reasons: [],
    };
  }

  // Eligible band: all non-Tier-1-protected candidates
  const bandStart = ranked.findIndex((c) => !isClearTier1(c));

  if (bandStart === -1) {
    // All candidates are protected clear Tier-1 winners — model band is empty
    // and no reranking should occur regardless of accumulated reasons.
    return {
      shouldInvokeModel: false,
      eligibleBand: { start: 0, end: 0 },
      reasons: [],
    };
  }

  const bandEnd = ranked.length;

  return {
    shouldInvokeModel: true,
    eligibleBand: { start: bandStart, end: bandEnd },
    reasons,
  };
}
