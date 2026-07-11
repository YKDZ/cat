import { describe, expect, it } from "vitest";

import { requireFixtureValue } from "#/testing/require-fixture-value.ts";

import { buildFusionLedger } from "./fusion-ledger.ts";
import type { RawTermResult } from "./types.ts";

const BASE_TERM: RawTermResult = {
  surface: "term",
  conceptId: 1,
  glossaryId: "g1",
  term: "foo",
  translation: "bar",
  definition: null,
  confidence: 0.8,
  evidences: [{ channel: "lexical", confidence: 0.8 }],
};

describe("buildFusionLedger", () => {
  it("deduplicates same concept and merges evidences", () => {
    const results = [
      {
        ...BASE_TERM,
        evidences: [{ channel: "lexical" as const, confidence: 0.8 }],
      },
      {
        ...BASE_TERM,
        confidence: 0.88,
        evidences: [{ channel: "morphological" as const, confidence: 0.88 }],
      },
    ];
    const ledger = buildFusionLedger(results);
    expect(ledger).toHaveLength(1);
    expect(requireFixtureValue(ledger[0]).confidence).toBe(0.88);
    const channels = new Set(
      requireFixtureValue(ledger[0]).evidences.map((e) => e.channel),
    );
    expect(channels.has("lexical")).toBe(true);
    expect(channels.has("morphological")).toBe(true);
  });

  it("keeps distinct candidates separate", () => {
    const results = [
      BASE_TERM,
      {
        ...BASE_TERM,
        conceptId: 2,
        evidences: [{ channel: "lexical" as const, confidence: 0.6 }],
      },
    ];
    const ledger = buildFusionLedger(results);
    expect(ledger).toHaveLength(2);
  });

  it("places higher confidence first", () => {
    const results = [
      {
        ...BASE_TERM,
        conceptId: 2,
        confidence: 0.6,
        evidences: [{ channel: "lexical" as const, confidence: 0.6 }],
      },
      BASE_TERM,
    ];
    const ledger = buildFusionLedger(results);
    expect(ledger[0]).toMatchObject({ conceptId: 1 });
  });

  it("records rankingDecisions for ledger entry and merge", () => {
    const results = [
      BASE_TERM,
      {
        ...BASE_TERM,
        confidence: 0.88,
        evidences: [{ channel: "morphological" as const, confidence: 0.88 }],
      },
    ];
    const ledger = buildFusionLedger(results);
    const decisions = requireFixtureValue(ledger[0]).rankingDecisions;
    expect(decisions.some((d) => d.action === "ledger-entered")).toBe(true);
    expect(
      decisions.some((d) => d.action === "ledger-confidence-updated"),
    ).toBe(true);
  });
});
