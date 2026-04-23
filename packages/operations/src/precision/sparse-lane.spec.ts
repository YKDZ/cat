import { describe, expect, it } from "vitest";

import type { RawTermResult } from "./types";

import { augmentWithSparseLane, computeSparseEvidence } from "./sparse-lane";

describe("computeSparseEvidence", () => {
  it("returns null when no content words match", () => {
    const ev = computeSparseEvidence(["silk", "touch"], "Zombie Head", 0.3);
    expect(ev).toBeNull();
  });

  it("returns evidence when at least one word matches above threshold", () => {
    const ev = computeSparseEvidence(["zombie", "head"], "Zombie Head", 0.3);
    expect(ev).not.toBeNull();
    expect(ev?.channel).toBe("sparse");
    expect(ev?.confidence).toBe(1);
  });

  it("partial match: score = matched/total", () => {
    const ev = computeSparseEvidence(
      ["zombie", "head", "mode"],
      "Zombie Head",
      0.3,
    );
    expect(ev?.confidence).toBeCloseTo(2 / 3, 5);
  });

  it("returns null when score below minScore", () => {
    const ev = computeSparseEvidence(["a", "b", "c", "d"], "a item", 0.6);
    expect(ev).toBeNull();
  });

  it("returns null when queryContentWords is empty", () => {
    const ev = computeSparseEvidence([], "Zombie Head");
    expect(ev).toBeNull();
  });
});

describe("augmentWithSparseLane", () => {
  it("adds sparse evidence to matching candidates", () => {
    const result: RawTermResult = {
      surface: "term",
      conceptId: 1,
      glossaryId: "g",
      term: "Zombie Head",
      translation: "僵尸头颅",
      definition: null,
      confidence: 0.8,
      evidences: [{ channel: "lexical", confidence: 0.8 }],
    };
    augmentWithSparseLane([result], ["zombie", "head"]);
    const channels = result.evidences.map((e) => e.channel);
    expect(channels).toContain("sparse");
  });
});
