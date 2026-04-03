import { describe, expect, it } from "vitest";

import {
  Blackboard,
  buildPatch,
  createPatchMetadata,
  deepMerge,
  setByPath,
} from "../blackboard.ts";

const TEST_RUN_ID = "00000000-0000-4000-8000-000000000001";
const TEST_NODE_ID = "nodeA";

describe("setByPath", () => {
  it("sets a top-level key", () => {
    const target: Record<string, unknown> = {};
    setByPath(target, "foo", 42);
    expect(target.foo).toBe(42);
  });

  it("sets a nested key, creating intermediate objects", () => {
    const target: Record<string, unknown> = {};
    setByPath(target, "a.b.c", "hello");
    // oxlint-disable-next-line no-unsafe-type-assertion
    expect((target.a as Record<string, unknown>)?.b).toEqual({ c: "hello" });
  });

  it("ignores an empty path", () => {
    const target: Record<string, unknown> = { x: 1 };
    setByPath(target, "", "ignored");
    expect(target).toEqual({ x: 1 });
  });
});

describe("deepMerge", () => {
  it("merges top-level keys", () => {
    const result = deepMerge({ a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("recursively merges nested objects", () => {
    const result = deepMerge({ a: { x: 1 } }, { a: { y: 2 } });
    expect(result).toEqual({ a: { x: 1, y: 2 } });
  });

  it("overwrites non-object with primitive", () => {
    const result = deepMerge({ a: { x: 1 } }, { a: "scalar" });
    expect(result).toEqual({ a: "scalar" });
  });

  it("handles dotted key paths in updates", () => {
    const result = deepMerge({ a: { x: 1 } }, { "a.y": 99 });
    // oxlint-disable-next-line no-unsafe-type-assertion
    expect((result.a as Record<string, unknown>).y).toBe(99);
  });

  it("does not mutate inputs", () => {
    const target = { a: 1 };
    deepMerge(target, { b: 2 });
    expect(target).toEqual({ a: 1 });
  });
});

describe("Blackboard constructor", () => {
  it("creates a snapshot with version 0", () => {
    const bb = new Blackboard({ runId: TEST_RUN_ID, initialData: { x: 1 } });
    const snapshot = bb.getSnapshot();
    expect(snapshot.runId).toBe(TEST_RUN_ID);
    expect(snapshot.version).toBe(0);
    expect(snapshot.data).toEqual({ x: 1 });
  });
});

describe("Blackboard.fromSnapshot", () => {
  it("restores state from a snapshot (sync)", () => {
    const bb = new Blackboard({
      runId: TEST_RUN_ID,
      initialData: { restored: true },
    });
    const snapshotBefore = bb.getSnapshot();

    const restored = Blackboard.fromSnapshot(snapshotBefore);
    const snapshotAfter = restored.getSnapshot();
    expect(snapshotAfter.version).toBe(snapshotBefore.version);
    expect(snapshotAfter.data).toEqual(snapshotBefore.data);
  });

  it("returns a Blackboard (not a Promise)", () => {
    const bb = new Blackboard({ runId: TEST_RUN_ID, initialData: {} });
    const result = Blackboard.fromSnapshot(bb.getSnapshot());
    expect(result).toBeInstanceOf(Blackboard);
    // fromSnapshot should be synchronous; result is not a Promise
    expect(result).not.toBeInstanceOf(Promise);
  });
});

describe("Blackboard.applyPatch", () => {
  it("applies updates and increments the version", () => {
    const bb = new Blackboard({ runId: TEST_RUN_ID, initialData: { x: 0 } });
    const patch = buildPatch({
      actorId: TEST_NODE_ID,
      parentSnapshotVersion: 0,
      updates: { x: 99 },
    });
    const result = bb.applyPatch(patch);
    expect(result.ok).toBe(true);
    const snapshot = bb.getSnapshot();
    expect(snapshot.version).toBe(1);
    expect(snapshot.data).toEqual({ x: 99 });
  });

  it("returns an error on version mismatch", () => {
    const bb = new Blackboard({ runId: TEST_RUN_ID, initialData: {} });
    const stale = buildPatch({
      actorId: TEST_NODE_ID,
      parentSnapshotVersion: 99, // wrong version
      updates: { key: "value" },
    });
    const result = bb.applyPatch(stale);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/version mismatch/i);
    }
  });

  it("merges nested objects", () => {
    const bb = new Blackboard({
      runId: TEST_RUN_ID,
      initialData: { user: { name: "Alice" } },
    });
    const patch = buildPatch({
      actorId: TEST_NODE_ID,
      parentSnapshotVersion: 0,
      updates: { user: { age: 30 } },
    });
    bb.applyPatch(patch);
    // oxlint-disable-next-line no-unsafe-type-assertion
    const data = bb.getSnapshot().data as Record<string, unknown>;
    expect(data.user).toEqual({ name: "Alice", age: 30 });
  });
});

describe("createPatchMetadata", () => {
  it("returns a valid PatchMetadata object", () => {
    const metadata = createPatchMetadata({
      actorId: TEST_NODE_ID,
      parentSnapshotVersion: 3,
    });
    expect(metadata.actorId).toBe(TEST_NODE_ID);
    expect(metadata.parentSnapshotVersion).toBe(3);
    expect(typeof metadata.patchId).toBe("string");
    expect(typeof metadata.timestamp).toBe("string");
  });
});

describe("getSnapshot isolation", () => {
  it("getSnapshot returns a clone, not the internal reference", () => {
    const bb = new Blackboard({ runId: TEST_RUN_ID, initialData: { x: 1 } });
    const snapshot = bb.getSnapshot();
    // oxlint-disable-next-line no-unsafe-type-assertion
    (snapshot.data as Record<string, unknown>).x = 999;
    // internal state should be unmodified
    // oxlint-disable-next-line no-unsafe-type-assertion
    expect((bb.getSnapshot().data as Record<string, unknown>).x).toBe(1);
  });
});
