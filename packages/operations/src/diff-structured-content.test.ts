import { describe, expect, it } from "vitest";

import { classifySemanticElementDiffForTest } from "./diff-structured-content";

describe("semantic structured content diff", () => {
  it("preserves vectorization for move-only changes", () => {
    const diff = classifySemanticElementDiffForTest({
      oldText: "Hello",
      newText: "Hello",
      oldPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      newPrimaryContentNodeId: "00000000-0000-4000-8000-000000000002",
      oldLocalOrder: 0,
      newLocalOrder: 5,
      oldMeta: { key: ["hello"] },
      newMeta: { key: ["hello"] },
    });
    expect(diff.diffKind).toBe("REPARENT");
    expect(diff.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });

  it("invalidates vectors only when source text changes", () => {
    const diff = classifySemanticElementDiffForTest({
      oldText: "Hello",
      newText: "Hello world",
      oldPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      newPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      oldLocalOrder: 0,
      newLocalOrder: 0,
      oldMeta: { key: ["hello"] },
      newMeta: { key: ["hello"] },
    });
    expect(diff.diffKind).toBe("SOURCE_TEXT_UPDATE");
    expect(diff.vectorInvalidationReason).toBe("SOURCE_TEXT_CHANGED");
  });

  it("classifies order-only changes as MOVE with no vector invalidation", () => {
    const diff = classifySemanticElementDiffForTest({
      oldText: "Same text",
      newText: "Same text",
      oldPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      newPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      oldLocalOrder: 0,
      newLocalOrder: 3,
      oldMeta: {},
      newMeta: {},
    });
    expect(diff.diffKind).toBe("MOVE");
    expect(diff.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });

  it("classifies metadata-only changes with no vector invalidation", () => {
    const diff = classifySemanticElementDiffForTest({
      oldText: "Hello",
      newText: "Hello",
      oldPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      newPrimaryContentNodeId: "00000000-0000-4000-8000-000000000001",
      oldLocalOrder: 0,
      newLocalOrder: 0,
      oldMeta: { key: ["a"] },
      newMeta: { key: ["b"] },
    });
    expect(diff.diffKind).toBe("METADATA_ONLY");
    expect(diff.vectorInvalidationReason).toBe("NOT_REQUIRED");
  });
});
