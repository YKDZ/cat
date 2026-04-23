import type { RecallChannel } from "@cat/shared/schema/recall";

import { assert, describe, expect, it } from "vitest";

import type { RecallCandidate } from "./types";

import { applyDeterministicRanking } from "./deterministic-ranker";

const PROFILE = {
  tokenCount: 2,
  contentWordDensity: 1,
  hasNumericAnchor: false,
  hasPlaceholderAnchor: false,
  isTemplateLike: false,
  isShortQuery: true,
  hasEntityWord: true,
};
const HYPOTHESIS_CONFIDENT = {
  topicIds: ["mob"],
  confidence: "confident" as const,
};
const HYPOTHESIS_UNKNOWN = { topicIds: [], confidence: "unknown" as const };

const make = (
  id: number,
  channels: RecallChannel[],
  confidence: number,
  topicState: "compatible" | "conflict" | "unknown" = "compatible",
): RecallCandidate => ({
  surface: "term",
  conceptId: id,
  glossaryId: "g",
  term: "t",
  translation: "tr",
  definition: null,
  confidence,
  evidences: channels.map((ch) => ({
    channel: ch,
    confidence,
  })),
  rankingDecisions: [],
  topicAssignment: {
    topicIds: ["mob"],
    source: "term-subject",
    matchState: topicState,
  },
});

describe("applyDeterministicRanking", () => {
  it("places exact match in Tier 1 above lexical-only Tier 3", () => {
    const exact = make(1, ["exact"], 0.8);
    const lexOnly = make(2, ["lexical"], 0.9); // higher raw confidence
    const ranked = applyDeterministicRanking(
      [lexOnly, exact],
      PROFILE,
      HYPOTHESIS_CONFIDENT,
    );
    const top = ranked[0];
    assert(top?.surface === "term", "expected term candidate at top");
    expect(top.conceptId).toBe(1); // exact → Tier 1 wins over single lexical
    expect(top.tier).toBe("1");
  });

  it("places multi-evidence candidate in Tier 2", () => {
    const multi = make(1, ["trgm", "morphological"], 0.75);
    const ranked = applyDeterministicRanking(
      [multi],
      PROFILE,
      HYPOTHESIS_CONFIDENT,
    );
    expect(ranked[0]?.tier).toBe("2");
  });

  it("demotes unknown-topic candidate to Tier 3 when hypothesis is confident", () => {
    const unknown = make(1, ["trgm", "semantic"], 0.82, "unknown");
    const ranked = applyDeterministicRanking(
      [unknown],
      PROFILE,
      HYPOTHESIS_CONFIDENT,
    );
    expect(ranked[0]?.tier).toBe("3");
  });

  it("keeps unknown-topic in Tier 2 when hypothesis is unknown", () => {
    const unknown = make(1, ["trgm", "semantic"], 0.82, "unknown");
    const ranked = applyDeterministicRanking(
      [unknown],
      PROFILE,
      HYPOTHESIS_UNKNOWN,
    );
    expect(ranked[0]?.tier).toBe("2");
  });
});
