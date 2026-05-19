import { and, eq, runtimeCacheEntry, runtimeSessionEntry } from "@cat/db";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { setupTestDB, type TestDB } from "@/testing/setup-test-db";

import { PostgresCacheStore } from "./postgres-cache-store";
import { PostgresSessionStore } from "./postgres-session-store";

let testDb: TestDB;

beforeAll(async () => {
  testDb = await setupTestDB();
});

afterAll(async () => {
  await testDb.cleanup();
});

describe("postgres runtime stores", () => {
  it("supports cache get/set/delete/has and preserves json null values", async () => {
    const namespace = `cache_${randomUUID()}`;
    const store = new PostgresCacheStore(testDb.client, namespace);

    await store.set("answer", { ok: true }, 60);
    expect(await store.has("answer")).toBe(true);
    expect(await store.get<{ ok: boolean }>("answer")).toEqual({ ok: true });

    await store.delete("answer");
    expect(await store.get("answer")).toBeNull();
    expect(await store.has("answer")).toBe(false);

    await store.set("nullable", null, 60);
    expect(await store.get("nullable")).toBeNull();
    expect(await store.has("nullable")).toBe(true);
  });

  it("expires cache rows and cleans them up in batches", async () => {
    const namespace = `cache_${randomUUID()}`;
    const store = new PostgresCacheStore(testDb.client, namespace);

    await testDb.client.insert(runtimeCacheEntry).values([
      {
        namespace,
        key: "expired-read",
        value: { state: "expired" },
        expiresAt: new Date(Date.now() - 5_000),
        lastAccessedAt: new Date(),
      },
      {
        namespace,
        key: "expired-cleanup-1",
        value: { state: "expired" },
        expiresAt: new Date(Date.now() - 4_000),
        lastAccessedAt: new Date(),
      },
      {
        namespace,
        key: "expired-cleanup-2",
        value: { state: "expired" },
        expiresAt: new Date(Date.now() - 3_000),
        lastAccessedAt: new Date(),
      },
      {
        namespace,
        key: "active",
        value: { state: "active" },
        expiresAt: new Date(Date.now() + 60_000),
        lastAccessedAt: new Date(),
      },
    ]);

    expect(await store.get("expired-read")).toBeNull();
    const removed = await store.cleanupExpired(500);
    expect(removed).toBe(2);

    const remaining = await testDb.client
      .select({ key: runtimeCacheEntry.key })
      .from(runtimeCacheEntry)
      .where(eq(runtimeCacheEntry.namespace, namespace));
    expect(remaining).toEqual([{ key: "active" }]);
  });

  it("supports session hash fields, destroy, expiry, and cleanup", async () => {
    const store = new PostgresSessionStore(testDb.client);
    const activeKey = `session_${randomUUID()}`;
    const destroyedKey = `session_${randomUUID()}`;
    const expiredReadKey = `session_${randomUUID()}`;
    const expiredCleanupKey = `session_${randomUUID()}`;

    await store.create(
      activeKey,
      {
        userId: 42,
        provider: "password",
      },
      60,
    );
    expect(await store.getField(activeKey, "userId")).toBe("42");
    expect(await store.getAll(activeKey)).toEqual({
      userId: "42",
      provider: "password",
    });

    await store.create(destroyedKey, { transient: "yes" }, 60);
    await store.destroy(destroyedKey);
    expect(await store.getAll(destroyedKey)).toBeNull();

    await testDb.client.insert(runtimeSessionEntry).values([
      {
        key: expiredReadKey,
        fields: { phase: "read" },
        expiresAt: new Date(Date.now() - 5_000),
      },
      {
        key: expiredCleanupKey,
        fields: { phase: "cleanup" },
        expiresAt: new Date(Date.now() - 4_000),
      },
    ]);

    expect(await store.getAll(expiredReadKey)).toBeNull();
    const removed = await store.cleanupExpired(500);
    expect(removed).toBe(1);

    const remaining = await testDb.client
      .select({ key: runtimeSessionEntry.key })
      .from(runtimeSessionEntry)
      .where(
        and(
          eq(runtimeSessionEntry.key, activeKey),
          eq(runtimeSessionEntry.key, activeKey),
        ),
      );
    expect(remaining).toHaveLength(1);
  });
});
