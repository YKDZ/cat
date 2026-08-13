import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createRedisCleanup,
  createSeedCleanup,
  createSeedPluginCleanup,
} from "./seeder.ts";

describe("createSeedCleanup", () => {
  const originalRedis = globalThis["__REDIS__"];

  afterEach(() => {
    if (originalRedis === undefined)
      Reflect.deleteProperty(globalThis, "__REDIS__");
    else globalThis["__REDIS__"] = originalRedis;
  });

  it("releases all seed resources exactly once after repeated interruption cleanup", async () => {
    const disconnectRedis = vi.fn();
    const cleanupDatabase = vi.fn().mockResolvedValue(undefined);
    const cleanup = createSeedCleanup({
      deactivatePlugins: vi.fn().mockResolvedValue(undefined),
      restorePermissionEngine: vi.fn(),
      restoreVectorizationQueue: vi.fn(),
      disconnectRedis,
      cleanupDatabase,
    });

    await cleanup();
    await cleanup();

    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(cleanupDatabase).toHaveBeenCalledOnce();
  });

  it("restores the plugin manager even when plugin deactivation fails", async () => {
    const cause = new Error("plugin cleanup failed");
    const deactivate = vi
      .fn()
      .mockRejectedValueOnce(cause)
      .mockResolvedValueOnce(undefined);
    const restorePluginManager = vi.fn();
    const runtime = {
      activatedPluginIds: new Set(["plugin-a"]),
      pluginManagerInstallation: {
        manager: {
          deactivate,
          isActive: vi.fn(() => true),
        },
        restore: restorePluginManager,
      },
    };
    const deactivatePlugins = vi.fn(
      createSeedPluginCleanup(runtime as never, {} as never),
    );
    const restorePermissionEngine = vi.fn();
    const restoreVectorizationQueue = vi.fn();
    const disconnectRedis = vi.fn();
    const cleanupDatabase = vi.fn().mockResolvedValue(undefined);
    const cleanup = createSeedCleanup({
      deactivatePlugins,
      restorePermissionEngine,
      restoreVectorizationQueue,
      disconnectRedis,
      cleanupDatabase,
    });

    const first = cleanup();
    const concurrent = cleanup();
    const expectedFailure = { errors: [{ errors: [cause] }] };
    await Promise.all([
      expect(first).rejects.toMatchObject(expectedFailure),
      expect(concurrent).rejects.toMatchObject(expectedFailure),
    ]);
    expect(deactivatePlugins).toHaveBeenCalledOnce();
    expect(deactivate).toHaveBeenCalledOnce();
    expect(restorePluginManager).toHaveBeenCalledOnce();
    expect(runtime.pluginManagerInstallation).toBeUndefined();
    expect(restorePermissionEngine).toHaveBeenCalledOnce();
    expect(restoreVectorizationQueue).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(cleanupDatabase).toHaveBeenCalledOnce();

    await expect(cleanup()).resolves.toBeUndefined();
    expect(deactivatePlugins).toHaveBeenCalledTimes(2);
    expect(deactivate).toHaveBeenCalledOnce();
    expect(restorePluginManager).toHaveBeenCalledOnce();
    expect(runtime.pluginManagerInstallation).toBeUndefined();
    expect(restorePermissionEngine).toHaveBeenCalledOnce();
    expect(restoreVectorizationQueue).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(cleanupDatabase).toHaveBeenCalledOnce();
  });

  it("removes only its own global Redis reference", () => {
    const redis = { disconnect: vi.fn() };
    globalThis["__REDIS__"] = redis as never;

    createRedisCleanup(redis as never, undefined)();

    expect(redis.disconnect).toHaveBeenCalledOnce();
    expect(globalThis["__REDIS__"]).toBeUndefined();
  });

  it("does not remove a Redis reference replaced by another owner", () => {
    const redis = { disconnect: vi.fn() };
    const replacement = { disconnect: vi.fn() };
    globalThis["__REDIS__"] = replacement as never;

    createRedisCleanup(redis as never, undefined)();

    expect(redis.disconnect).toHaveBeenCalledOnce();
    expect(globalThis["__REDIS__"]).toBe(replacement);
  });

  it("restores the global Redis reference even when disconnect fails", () => {
    const cause = new Error("disconnect failed");
    const redis = {
      disconnect: vi.fn(() => {
        throw cause;
      }),
    };
    globalThis["__REDIS__"] = redis as never;

    expect(() => createRedisCleanup(redis as never, undefined)()).toThrow(
      cause,
    );

    expect(globalThis["__REDIS__"]).toBeUndefined();
  });
});
