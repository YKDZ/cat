// packages/operations/src/precision/deterministic-ranker.ts
import type { QueryProfile, QueryTopicHypothesis } from "@cat/shared";

import type { RecallCandidate } from "./types";

const MULTI_EVIDENCE_THRESHOLD = 2;

/** Returns a tier 1, 2, or 3 classification for a candidate. */
function assignTier(
  c: RecallCandidate,
  _profile: QueryProfile,
  hypothesis: QueryTopicHypothesis,
): "1" | "2" | "3" {
  const channels = new Set(c.evidences.map((e) => e.channel));
  const topicState = c.topicAssignment?.matchState ?? "unknown";

  // ── Tier 1: highest certainty ───────────────────────────────────
  const isExact = channels.has("exact");
  const isHighConfidenceLexical =
    channels.has("lexical") &&
    c.evidences.some((e) => e.channel === "lexical" && e.confidence >= 0.95);
  const isTemplateMatch = channels.has("template");
  const isAnchorCompatible =
    c.anchorSignature?.numbersCompatible !== false &&
    c.anchorSignature?.placeholdersCompatible !== false;
  const isTopicCompatible =
    topicState === "compatible" || topicState === "unknown";

  if (
    (isExact || isHighConfidenceLexical || isTemplateMatch) &&
    isAnchorCompatible &&
    isTopicCompatible
  ) {
    return "1";
  }

  // ── Tier 3: low certainty ───────────────────────────────────────
  // Single-path hit only, or unknown topic when hypothesis is confident
  if (c.evidences.length < MULTI_EVIDENCE_THRESHOLD) {
    return "3";
  }
  if (topicState === "unknown" && hypothesis.confidence === "confident") {
    return "3";
  }

  // ── Tier 2: multi-evidence consensus ───────────────────────────
  return "2";
}

/** Bucket score within a tier (higher = better within the tier). */
function inTierScore(c: RecallCandidate): number {
  const evidenceCount = c.evidences.length;
  const topicBonus = c.topicAssignment?.matchState === "compatible" ? 0.05 : 0;
  const anchorBonus =
    c.anchorSignature?.numbersCompatible &&
    c.anchorSignature?.placeholdersCompatible
      ? 0.02
      : 0;
  return c.confidence + topicBonus + anchorBonus + evidenceCount * 0.001;
}

const TIER_ORDER: Record<"1" | "2" | "3", number> = { "1": 0, "2": 1, "3": 2 };

/**
 * Assign tiers to all candidates, sort by tier then in-tier score,
 * and record tier assignments in rankingDecisions.
 */
export function applyDeterministicRanking(
  candidates: RecallCandidate[],
  profile: QueryProfile,
  hypothesis: QueryTopicHypothesis,
): RecallCandidate[] {
  for (const c of candidates) {
    const tier = assignTier(c, profile, hypothesis);
    c.tier = tier;
    c.rankingDecisions.push({
      tier,
      action: "tier-assigned",
      note: `assigned to Tier ${tier}: channels=${[...new Set(c.evidences.map((e) => e.channel))].join(",")}, topicState=${c.topicAssignment?.matchState ?? "none"}, confidence=${c.confidence.toFixed(3)}`,
    });
  }

  return [...candidates].sort(
    (a, b) =>
      TIER_ORDER[a.tier ?? "3"] - TIER_ORDER[b.tier ?? "3"] ||
      inTierScore(b) - inTierScore(a),
  );
}
