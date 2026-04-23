import { describe, expect, it } from "vitest";

import type { RecallCandidate } from "./types";

import { suppressTier3IfClearTier1Winner } from "./precision-pipeline";

const make = (
  id: number,
  conf: number,
  tier: "1" | "2" | "3",
  rankingDecisions: RecallCandidate["rankingDecisions"] = [],
): RecallCandidate => ({
  surface: "term",
  conceptId: id,
  glossaryId: "g",
  term: "t",
  translation: "tr",
  definition: null,
  confidence: conf,
  tier,
  evidences: [],
  rankingDecisions,
});

describe("suppressTier3IfClearTier1Winner", () => {
  it("suppresses Tier-3 when top is clear Tier-1 winner", () => {
    const tier1 = make(1, 0.95, "1");
    const tier3 = make(2, 0.6, "3");
    const result = suppressTier3IfClearTier1Winner([tier1, tier3]);
    expect(result).toHaveLength(1);
    expect(result[0]?.tier).toBe("1");
  });

  it("does not suppress Tier-3 when top Tier-1 has recoverable-demotion", () => {
    const tier1 = make(1, 0.95, "1", [
      { action: "recoverable-demotion", note: "conflict" },
    ]);
    const tier3 = make(2, 0.6, "3");
    const result = suppressTier3IfClearTier1Winner([tier1, tier3]);
    expect(result).toHaveLength(2);
  });

  it("does not suppress Tier-3 when top is Tier-2", () => {
    const tier2 = make(1, 0.8, "2");
    const tier3 = make(2, 0.6, "3");
    const result = suppressTier3IfClearTier1Winner([tier2, tier3]);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    expect(suppressTier3IfClearTier1Winner([])).toHaveLength(0);
  });
});
