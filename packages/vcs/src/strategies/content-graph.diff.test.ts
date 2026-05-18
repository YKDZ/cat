import { describe, expect, it } from "vitest";

import { getDefaultRegistries } from "../index";

describe("content graph VCS strategies", () => {
  it("registers graph entity strategies and application methods", () => {
    const { diffRegistry, appMethodRegistry } = getDefaultRegistries();
    for (const entityType of [
      "content_node",
      "content_relation",
      "content_relation_type",
      "context_evidence",
      "context_profile",
      "scope_binding",
      "semantic_diff",
    ]) {
      expect(diffRegistry.has(entityType)).toBe(true);
      expect(appMethodRegistry.has(entityType)).toBe(true);
    }
    expect(diffRegistry.has("document")).toBe(false);
    expect(diffRegistry.has("document_tree")).toBe(false);
    expect(diffRegistry.has("content_node")).toBe(true);
    expect(diffRegistry.has("content_relation")).toBe(true);
  });

  it("treats primary relation order changes as cascading", () => {
    const { diffRegistry } = getDefaultRegistries();
    const diff = diffRegistry.diff(
      "content_relation",
      { id: "r1", isPrimary: true, localOrder: 0 },
      { id: "r1", isPrimary: true, localOrder: 3 },
    );
    expect(diff.impactScope).toBe("CASCADING");
    expect(diff.changes.map((change) => change.path)).toContain("localOrder");
  });
});
