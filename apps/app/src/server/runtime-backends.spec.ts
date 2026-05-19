import type { DrizzleClient } from "@cat/db";

import {
  MemoryCacheStore,
  MemorySessionStore,
  PostgresCacheStore,
  PostgresSessionStore,
  resolveRuntimeProfile,
} from "@cat/domain";
import { RedisCacheStore, RedisSessionStore } from "@cat/server-shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetRedisHandle } = vi.hoisted(() => ({
  mockGetRedisHandle: vi.fn(),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    getRedisHandle: mockGetRedisHandle,
  };
});

import { createRuntimeBackends } from "./runtime-backends";

describe("createRuntimeBackends", () => {
  beforeEach(() => {
    mockGetRedisHandle.mockReset();
  });

  it("uses in-memory backends for the lite profile without touching Redis", async () => {
    const profile = resolveRuntimeProfile({ NODE_ENV: "development" });
    // oxlint-disable-next-line no-unsafe-type-assertion -- constructor-only dependency in this unit test
    const db = {} as DrizzleClient;

    const backends = await createRuntimeBackends(profile, db);

    expect(backends.cacheStore).toBeInstanceOf(MemoryCacheStore);
    expect(backends.sessionStore).toBeInstanceOf(MemorySessionStore);
    expect(backends.vectorizationQueue.constructor.name).toBe(
      "InMemoryTaskQueue",
    );
    expect(backends.redis).toBeUndefined();
    expect(mockGetRedisHandle).not.toHaveBeenCalled();
  });

  it("uses PostgreSQL-backed stores for the standard profile", async () => {
    const profile = resolveRuntimeProfile({ CAT_RUNTIME_PROFILE: "standard" });
    // oxlint-disable-next-line no-unsafe-type-assertion -- constructor-only dependency in this unit test
    const db = {} as DrizzleClient;

    const backends = await createRuntimeBackends(profile, db);

    expect(backends.cacheStore).toBeInstanceOf(PostgresCacheStore);
    expect(backends.sessionStore).toBeInstanceOf(PostgresSessionStore);
    expect(backends.vectorizationQueue.constructor.name).toBe(
      "PostgresTaskQueue",
    );
    expect(backends.redis).toBeUndefined();
    expect(mockGetRedisHandle).not.toHaveBeenCalled();
  });

  it("uses Redis-backed stores for the production profile", async () => {
    const ping = vi.fn().mockResolvedValue(undefined);
    const redisHandle = {
      ping,
      redis: {},
    };
    mockGetRedisHandle.mockResolvedValue(redisHandle);

    const profile = resolveRuntimeProfile({ NODE_ENV: "production" });
    // oxlint-disable-next-line no-unsafe-type-assertion -- constructor-only dependency in this unit test
    const db = {} as DrizzleClient;

    const backends = await createRuntimeBackends(profile, db);

    expect(backends.cacheStore).toBeInstanceOf(RedisCacheStore);
    expect(backends.sessionStore).toBeInstanceOf(RedisSessionStore);
    expect(backends.vectorizationQueue.constructor.name).toBe("RedisTaskQueue");
    expect(backends.redis).toBe(redisHandle);
    expect(mockGetRedisHandle).toHaveBeenCalledOnce();
    expect(ping).toHaveBeenCalledOnce();
  });
});
