import type { RecallChannel } from "@cat/shared/schema/recall";

import { describe, expect, it } from "vitest";

import type { RecallCandidate } from "./types";

import { evaluateAmbiguity } from "./ambiguity-gate";

const CONF = { topicIds: ["mob"], confidence: "confident" as const };

const make = (
  id: number,
  conf: number,
  tier: "1" | "2" | "3",
  channels: RecallChannel[],
): RecallCandidate => ({
  surface: "term",
  conceptId: id,
  glossaryId: "g",
  term: "t",
  translation: "tr",
  definition: null,
  confidence: conf,
  tier,
  evidences: channels.map((ch) => ({
    channel: ch,
    confidence: conf,
  })),
  rankingDecisions: [],
});

describe("evaluateAmbiguity", () => {
  it("returns shouldInvokeModel=false for clear Tier-1 winner with large gap", () => {
    const ranked = [make(1, 0.95, "1", ["exact"]), make(2, 0.6, "2", ["trgm"])];
    const env = evaluateAmbiguity(ranked, CONF);
    expect(env.shouldInvokeModel).toBe(false);
  });

  it("fires on small confidence gap", () => {
    const ranked = [
      make(1, 0.8, "2", ["trgm"]),
      make(2, 0.78, "2", ["semantic"]),
    ];
    const env = evaluateAmbiguity(ranked, CONF);
    expect(env.shouldInvokeModel).toBe(true);
    expect(env.reasons.some((r) => r.startsWith("confidence-gap"))).toBe(true);
  });

  it("fires on evidence divergence", () => {
    const ranked = [
      make(1, 0.8, "2", ["lexical"]),
      make(2, 0.7, "2", ["semantic"]),
    ];
    const env = evaluateAmbiguity(ranked, CONF);
    expect(env.shouldInvokeModel).toBe(true);
  });

  it("does not fire Rule 1 when top is clear Tier-1 despite small gap", () => {
    // gap 0.04 < threshold, but Tier-1 winner should be exempt from Rule 1
    const ranked = [
      make(1, 0.95, "1", ["exact"]),
      make(2, 0.91, "3", ["semantic"]),
    ];
    const env = evaluateAmbiguity(ranked, CONF);
    expect(env.reasons.some((r) => r.startsWith("confidence-gap"))).toBe(false);
  });

  it("returns shouldInvokeModel=false when all candidates are clear Tier-1", () => {
    // Even with topic uncertainty (Rule 3), an all-Tier-1 band must stay protected
    const ranked = [
      make(1, 0.95, "1", ["exact"]),
      make(2, 0.9, "1", ["lexical"]),
    ];
    const env = evaluateAmbiguity(ranked, {
      topicIds: [],
      confidence: "unknown",
    });
    expect(env.shouldInvokeModel).toBe(false);
    expect(env.eligibleBand).toEqual({ start: 0, end: 0 });
  });

  it("returns empty band when no candidates", () => {
    const env = evaluateAmbiguity([], CONF);
    expect(env.shouldInvokeModel).toBe(false);
  });
});
