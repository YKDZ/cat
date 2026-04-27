import type { RecallEvidence } from "@cat/shared";

import { describe, it, expect } from "vitest";

import type { HnfCandidate } from "./types";

import {
  applyHnfPreRules,
  applyHnfPostRules,
  extractContentWordsFromTokens,
} from "./core";

const makeCandidate = (
  overrides: Partial<HnfCandidate> & {
    candidateKey: string;
    candidateTextLower: string;
  },
): HnfCandidate => ({
  surface: "memory",
  evidences: [],
  confidence: 0.8,
  ...overrides,
});

const makeEvidence = (
  channel: RecallEvidence["channel"],
  confidence: number,
): RecallEvidence => ({
  channel,
  matchedText: "test",
  confidence,
});

describe("HNF core: extractContentWordsFromTokens", () => {
  it("extracts content words and key nouns", () => {
    const tokens = [
      { lemma: "brown", isStop: false, isPunct: false, pos: "ADJ" },
      { lemma: "glazed", isStop: false, isPunct: false, pos: "VERB" },
      { lemma: "terracotta", isStop: false, isPunct: false, pos: "NOUN" },
      { lemma: "the", isStop: true, isPunct: false, pos: "DET" },
    ];
    const { contentWords, keyNouns } = extractContentWordsFromTokens(tokens);
    expect(contentWords).toEqual(["brown", "glazed", "terracotta"]);
    expect(keyNouns).toEqual(["terracotta"]);
  });

  it("handles empty tokens", () => {
    const { contentWords, keyNouns } = extractContentWordsFromTokens([]);
    expect(contentWords).toEqual([]);
    expect(keyNouns).toEqual([]);
  });
});

describe("HNF core: applyHnfPreRules", () => {
  it("Rule 1: semantic-only, no CW intersection, length anomaly, no key nouns -> removed", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "bamboo jungle biome",
        evidences: [makeEvidence("semantic", 0.75)],
      }),
    ];
    // queryTextLength=5 makes lengthRatio=18/5=3.6 > 3 => length anomaly
    const { kept, removals } = applyHnfPreRules(
      candidates,
      ["brown", "glazed", "terracotta"],
      ["terracotta"],
      5,
    );
    expect(kept).toHaveLength(0);
    expect(removals).toHaveLength(1);
    expect(removals[0].reason).toBe("isolated-semantic");
  });

  it("Rule 1: semantic-only but has CW intersection -> kept", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "brown glazed item",
        evidences: [makeEvidence("semantic", 0.75)],
      }),
    ];
    const { kept, removals } = applyHnfPreRules(
      candidates,
      ["brown", "glazed", "terracotta"],
      ["terracotta"],
      20,
    );
    expect(kept).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });

  it("Rule 1: semantic-only, no CW, length anomaly, but key noun present -> passes Rule 1 then kept by Rule 3 via partial content overlap", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "brown terracotta item",
        evidences: [makeEvidence("semantic", 0.75)],
      }),
    ];
    // queryTextLength=5 makes lengthRatio~3.6 > 3 => length anomaly
    // "brown terracotta item" includes "brown" => CW intersection > 0 => passes Rule 3
    const { kept, removals } = applyHnfPreRules(
      candidates,
      ["brown", "glazed"],
      ["terracotta"],
      5,
    );
    expect(kept).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });

  it("Rule 2: sparse < 0.2, semantic > 0.7 -> confidence discounted", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "test item",
        confidence: 0.8,
        evidences: [
          makeEvidence("semantic", 0.85),
          makeEvidence("sparse", 0.15),
        ],
      }),
    ];
    const { kept } = applyHnfPreRules(
      candidates,
      ["test", "item"],
      ["item"],
      10,
    );
    expect(kept).toHaveLength(1);
    // Discount factor = max(0.15, 0.3) = 0.3, so 0.8 * 0.3 = 0.24
    expect(kept[0].confidence).toBeCloseTo(0.24);
  });

  it("Rule 2: sparse >= 0.2 or semantic <= 0.7 -> no change", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "test item",
        confidence: 0.8,
        evidences: [
          makeEvidence("semantic", 0.85),
          makeEvidence("sparse", 0.25), // >= 0.2
        ],
      }),
      makeCandidate({
        candidateKey: "c2",
        candidateTextLower: "test item 2",
        confidence: 0.8,
        evidences: [
          makeEvidence("semantic", 0.65), // <= 0.7
          makeEvidence("sparse", 0.15),
        ],
      }),
    ];
    const { kept } = applyHnfPreRules(
      candidates,
      ["test", "item"],
      ["item"],
      10,
    );
    expect(kept).toHaveLength(2);
    // First candidate's confidence stays at 0.8 (sparse >= 0.2)
    expect(kept[0].confidence).toBeCloseTo(0.8);
    // Second candidate's confidence stays at 0.8 (semantic <= 0.7)
    expect(kept[1].confidence).toBeCloseTo(0.8);
  });

  it("Rule 3: non-exact, non-template, CW intersection = 0 -> removed", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "completely different text",
        evidences: [makeEvidence("semantic", 0.6), makeEvidence("sparse", 0.3)],
      }),
    ];
    const { kept, removals } = applyHnfPreRules(
      candidates,
      ["brown", "glazed"],
      [],
      20,
    );
    expect(kept).toHaveLength(0);
    expect(removals).toHaveLength(1);
    expect(removals[0].reason).toBe("cw-zero-intersection");
  });

  it("Rule 3: exact channel present -> kept even without CW intersection", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "different",
        evidences: [makeEvidence("exact", 1.0)],
      }),
    ];
    const { kept, removals } = applyHnfPreRules(candidates, ["brown"], [], 20);
    expect(kept).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });

  it("Rule 3: template channel present -> kept even without CW intersection", () => {
    const candidates = [
      makeCandidate({
        candidateKey: "c1",
        candidateTextLower: "different",
        evidences: [makeEvidence("template", 1.0)],
      }),
    ];
    const { kept, removals } = applyHnfPreRules(candidates, ["brown"], [], 20);
    expect(kept).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });
});

describe("HNF core: applyHnfPostRules", () => {
  it("Rule 4: tier 3, semantic-only, no CW -> removed", () => {
    const candidates = [
      {
        surface: "memory" as const,
        candidateKey: "c1" as const,
        candidateTextLower: "unrelated content",
        evidences: [makeEvidence("semantic", 0.6)],
        confidence: 0.6,
        tier: "3" as const,
      },
    ];
    const { kept, removals } = applyHnfPostRules(candidates, [
      "brown",
      "glazed",
    ]);
    expect(kept).toHaveLength(0);
    expect(removals).toHaveLength(1);
    expect(removals[0].reason).toBe("tier3-isolated-semantic");
  });

  it("Rule 4: tier 3 but has other channels -> kept", () => {
    const candidates = [
      {
        surface: "memory" as const,
        candidateKey: "c1" as const,
        candidateTextLower: "unrelated content",
        evidences: [makeEvidence("semantic", 0.6), makeEvidence("sparse", 0.4)],
        confidence: 0.6,
        tier: "3" as const,
      },
    ];
    const { kept, removals } = applyHnfPostRules(candidates, ["brown"]);
    expect(kept).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });

  it("Rule 4: not tier 3 -> kept", () => {
    const candidates = [
      {
        surface: "memory" as const,
        candidateKey: "c1" as const,
        candidateTextLower: "unrelated content",
        evidences: [makeEvidence("semantic", 0.6)],
        confidence: 0.6,
        tier: "1" as const,
      },
    ];
    const { kept, removals } = applyHnfPostRules(candidates, ["brown"]);
    expect(kept).toHaveLength(1);
    expect(removals).toHaveLength(0);
  });
});
