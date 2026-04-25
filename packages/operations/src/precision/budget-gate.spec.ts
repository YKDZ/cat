import type { RecallChannel } from "@cat/shared";

import { describe, expect, it } from "vitest";

import type { RecallCandidate } from "./types";

import { applyBudgetGate } from "./budget-gate";

const PROFILE = {
  tokenCount: 2,
  contentWordDensity: 1,
  hasNumericAnchor: false,
  hasPlaceholderAnchor: false,
  isTemplateLike: false,
  isShortQuery: true,
  hasEntityWord: false,
};

const make = (
  id: number,
  channel: RecallChannel,
  confidence = 0.8,
): RecallCandidate => ({
  surface: "term",
  conceptId: id,
  glossaryId: "g1",
  term: "t",
  translation: "tr",
  definition: null,
  confidence,
  evidences: [{ channel, confidence }],
  rankingDecisions: [],
});

describe("applyBudgetGate", () => {
  it("promotes exact-match candidate to reserved", () => {
    const candidates = [
      make(1, "trgm", 0.75),
      {
        ...make(2, "exact", 1),
        evidences: [{ channel: "exact" as const, confidence: 1 }],
      },
    ];
    const result = applyBudgetGate(candidates, PROFILE, { maxTotal: 5 });
    expect(result[0]).toMatchObject({ conceptId: 2, budgetClass: "reserved" });
  });

  it("respects maxTotal limit", () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      make(i, "lexical", 0.7),
    );
    const result = applyBudgetGate(candidates, PROFILE, { maxTotal: 5 });
    expect(result).toHaveLength(5);
  });

  it("records budget decision note", () => {
    const candidates = [make(1, "lexical")];
    const result = applyBudgetGate(candidates, PROFILE, { maxTotal: 5 });
    const decision = result[0].rankingDecisions.find(
      (d) => d.action === "budget-classified",
    );
    expect(decision).toBeDefined();
  });
});
