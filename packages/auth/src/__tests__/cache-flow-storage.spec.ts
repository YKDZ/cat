import { afterEach, describe, expect, it, vi } from "vitest";

import type { AuthBlackboardSnapshot } from "../blackboard.ts";

import { CacheFlowStorage } from "../storage/cache-flow-storage.ts";

class InMemoryCacheStore {
  private readonly store = new Map<
    string,
    { expiresAt: number | null; value: unknown }
  >();

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }

    // oxlint-disable-next-line no-unsafe-type-assertion -- test-only in-memory cache round-trip
    return entry.value as T;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }
}

const createSnapshot = (flowId: string): AuthBlackboardSnapshot => {
  // oxlint-disable-next-line no-unsafe-type-assertion -- storage only performs round-trip persistence in this unit test
  return {
    flowId,
    data: {
      identity: {
        userId: "user-1",
      },
    },
  } as AuthBlackboardSnapshot;
};

afterEach(() => {
  vi.useRealTimers();
});

describe("CacheFlowStorage", () => {
  it("saves, loads, and deletes flow snapshots via CacheStore", async () => {
    const cacheStore = new InMemoryCacheStore();
    const storage = new CacheFlowStorage(cacheStore);
    const snapshot = createSnapshot("flow-1");

    await storage.save("flow-1", snapshot, 60);
    await expect(storage.load("flow-1")).resolves.toEqual(snapshot);

    await storage.delete("flow-1");
    await expect(storage.load("flow-1")).resolves.toBeNull();
  });

  it("expires snapshots according to TTL", async () => {
    vi.useFakeTimers();
    const cacheStore = new InMemoryCacheStore();
    const storage = new CacheFlowStorage(cacheStore);

    await storage.save("flow-2", createSnapshot("flow-2"), 1);
    await expect(storage.load("flow-2")).resolves.not.toBeNull();

    await vi.advanceTimersByTimeAsync(1_001);
    await expect(storage.load("flow-2")).resolves.toBeNull();
  });
});
