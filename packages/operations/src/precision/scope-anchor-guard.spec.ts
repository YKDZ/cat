import type { QueryTopicHypothesis } from "@cat/shared/schema/precision-recall";

import { describe, expect, it } from "vitest";

import type { RecallCandidate } from "./types";

import {
  applyGuardsToCandidates,
  buildAnchorSignature,
} from "./scope-anchor-guard";

const HYPOTHESIS_CONFIDENT: QueryTopicHypothesis = {
  topicIds: ["mob"],
  confidence: "confident",
};
const HYPOTHESIS_UNKNOWN: QueryTopicHypothesis = {
  topicIds: [],
  confidence: "unknown",
};

const makeTermCand = (
  id: number,
  overrides: {
    term?: string;
    topicAssignment?: RecallCandidate["topicAssignment"];
  } = {},
): RecallCandidate => ({
  surface: "term",
  conceptId: id,
  glossaryId: "g1",
  term: overrides.term ?? "foo",
  translation: "bar",
  definition: null,
  confidence: 0.8,
  evidences: [],
  rankingDecisions: [],
  topicAssignment: overrides.topicAssignment,
});

describe("buildAnchorSignature", () => {
  it("detects numeric incompatibility", () => {
    const sig = buildAnchorSignature("Order 42 done", "Order 99 done");
    expect(sig.numbersCompatible).toBe(false);
  });

  it("passes when numbers match", () => {
    const sig = buildAnchorSignature("Order 42 done", "Order 42 completed");
    expect(sig.numbersCompatible).toBe(true);
  });
});

describe("applyGuardsToCandidates", () => {
  it("hard-filters topic-conflict when hypothesis is confident", () => {
    const cand = makeTermCand(1, {
      topicAssignment: {
        topicIds: ["ui"],
        source: "term-subject",
        matchState: "conflict",
      },
    });
    const result = applyGuardsToCandidates(
      [cand],
      "zombie head",
      HYPOTHESIS_CONFIDENT,
      { allowedScopeIds: [] },
    );
    expect(result).toHaveLength(0);
    expect(cand.hardFiltered).toBe(true);
  });

  it("allows topic-conflict when hypothesis is unknown", () => {
    const cand = makeTermCand(1, {
      topicAssignment: {
        topicIds: ["ui"],
        source: "term-subject",
        matchState: "conflict",
      },
    });
    const result = applyGuardsToCandidates(
      [cand],
      "zombie head",
      HYPOTHESIS_UNKNOWN,
      { allowedScopeIds: [] },
    );
    expect(result).toHaveLength(1);
    expect(cand.hardFiltered).toBeFalsy();
  });

  it("hard-filters numeric anchor conflict", () => {
    const cand = makeTermCand(1, {
      term: "Order 99 done",
      topicAssignment: {
        topicIds: [],
        source: "term-subject",
        matchState: "unknown",
      },
    });
    const result = applyGuardsToCandidates(
      [cand],
      "Order 42 done",
      HYPOTHESIS_UNKNOWN,
      { allowedScopeIds: [] },
    );
    expect(result).toHaveLength(0);
    expect(cand.hardFiltered).toBe(true);
    expect(cand.hardFilterReason).toContain("anchor-conflict");
  });
});
