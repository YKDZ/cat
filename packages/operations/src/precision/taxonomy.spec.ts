import { describe, expect, it } from "vitest";

import type { RecallCandidate } from "./types";

import { resolveQueryTopic } from "./query-topic-resolver";
import { createTaxonomyRegistry } from "./taxonomy-registry";

const PROFILE = {
  tokenCount: 2,
  contentWordDensity: 1,
  hasNumericAnchor: false,
  hasPlaceholderAnchor: false,
  isTemplateLike: false,
  isShortQuery: true,
  hasEntityWord: false,
};

describe("TaxonomyRegistry", () => {
  const registry = createTaxonomyRegistry({
    subjectToTopicMap: new Map([["hostile-mob", "minecraft-mob"]]),
    memoryContainerDefaults: new Map([["mem1", ["minecraft-mob"]]]),
    memoryItemOverrides: new Map([[999, ["ui"]]]),
  });

  it("term: resolves subject to topic, compatible against query", () => {
    const assignment = registry.assignTopicToTermCandidate(
      ["hostile-mob"],
      ["minecraft-mob"],
    );
    expect(assignment.topicIds).toEqual(["minecraft-mob"]);
    expect(assignment.matchState).toBe("compatible");
  });

  it("term: unknown when no subjects", () => {
    const assignment = registry.assignTopicToTermCandidate(
      [],
      ["minecraft-mob"],
    );
    expect(assignment.matchState).toBe("unknown");
  });

  it("memory: item override takes priority over container default", () => {
    const result = registry.assignTopicToMemoryCandidate("mem1", 999, ["ui"]);
    expect(result.topicIds).toEqual(["ui"]);
    expect(result.source).toBe("memory-item-override");
  });

  it("memory: falls back to container default", () => {
    const result = registry.assignTopicToMemoryCandidate("mem1", 1, [
      "minecraft-mob",
    ]);
    expect(result.topicIds).toEqual(["minecraft-mob"]);
    expect(result.source).toBe("memory-container-default");
  });
});

describe("resolveQueryTopic", () => {
  const makeCand = (
    conceptId: number,
    topicId: string | null,
  ): RecallCandidate => ({
    surface: "term",
    conceptId,
    glossaryId: "g",
    term: "t",
    translation: "tr",
    definition: null,
    confidence: 0.9,
    evidences: [],
    rankingDecisions: [],
    budgetClass: "reserved",
    topicAssignment: topicId
      ? {
          topicIds: [topicId],
          source: "term-subject",
          matchState: "compatible",
        }
      : undefined,
  });

  it("confident when 2+ reserved candidates share a topic", () => {
    const h = resolveQueryTopic(
      [makeCand(1, "mob"), makeCand(2, "mob")],
      PROFILE,
    );
    expect(h.confidence).toBe("confident");
    expect(h.topicIds).toEqual(["mob"]);
  });

  it("unknown when no reserved candidates have topics", () => {
    const h = resolveQueryTopic([makeCand(1, null)], PROFILE);
    expect(h.confidence).toBe("unknown");
  });
});
