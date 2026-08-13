import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  RedisConnection: vi.fn(),
  executeCommand: vi.fn(),
  setupTestDB: vi.fn(),
}));

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeCommand: mocks.executeCommand,
}));

vi.mock("@cat/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/db")>()),
  RedisConnection: mocks.RedisConnection,
}));

vi.mock("@cat/test-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/test-utils")>()),
  setupTestDB: mocks.setupTestDB,
}));

import {
  PluginManager,
  type PluginLoader,
  type ScopedPluginManagerInstallation,
} from "@cat/plugin-core";
import {
  getVectorizationQueue,
  installVectorizationQueue,
} from "@cat/server-shared";

import { EvalInterruptedError } from "../cancellation.ts";
import { seed } from "./seeder.ts";

describe("seed cleanup ownership", () => {
  const originalRedis = globalThis["__REDIS__"];
  const originalPermissionEngine = globalThis.__PERMISSION_ENGINE__;

  afterEach(() => {
    if (originalRedis === undefined)
      Reflect.deleteProperty(globalThis, "__REDIS__");
    else globalThis["__REDIS__"] = originalRedis;
    globalThis.__PERMISSION_ENGINE__ = originalPermissionEngine;
    PluginManager.clear();
  });

  beforeEach(() => {
    mocks.RedisConnection.mockReset();
    mocks.executeCommand.mockReset();
    mocks.setupTestDB.mockReset();
    PluginManager.clear();
  });

  it("cleans setup resources when hydration is interrupted before Redis connects", async () => {
    const cleanupDatabase = vi.fn().mockResolvedValue(undefined);
    const connectRedis = vi.fn();
    const disconnectRedis = vi.fn();
    const previousRedis = { disconnect: vi.fn() };
    globalThis["__REDIS__"] = previousRedis as never;
    mocks.setupTestDB.mockResolvedValue({
      cleanup: cleanupDatabase,
      client: {},
    });
    // Vitest's vi.fn type loses construct signatures; `new RedisConnection()` needs a class.
    mocks.RedisConnection.mockImplementation(
      class {
        public connect = connectRedis;
        public disconnect = disconnectRedis;
      } as never,
    );
    const controller = new AbortController();
    controller.abort(new EvalInterruptedError());

    const result = await seed({
      suite: { config: {} },
      cacheDir: "/tmp/eval-cache",
      pluginsDir: "/tmp/eval-plugins",
      signal: controller.signal,
    } as never).catch((error: unknown) => error);
    expect(result).toBeInstanceOf(EvalInterruptedError);

    expect(cleanupDatabase).toHaveBeenCalledOnce();
    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(globalThis["__REDIS__"]).toBe(previousRedis);
  });

  it("cleans the database when Redis construction throws synchronously", async () => {
    const cleanupDatabase = vi.fn().mockResolvedValue(undefined);
    const cause = new Error("redis construction failed");
    mocks.setupTestDB.mockResolvedValue({
      cleanup: cleanupDatabase,
      client: {},
    });
    mocks.RedisConnection.mockImplementation(
      class {
        public constructor() {
          throw cause;
        }
      } as never,
    );

    await expect(
      seed({
        suite: { config: {} },
        cacheDir: "/tmp/eval-cache",
        pluginsDir: "/tmp/eval-plugins",
      } as never),
    ).rejects.toBe(cause);

    expect(cleanupDatabase).toHaveBeenCalledOnce();
  });

  it("cleans the database when Redis connection rejects", async () => {
    const cleanupDatabase = vi.fn().mockResolvedValue(undefined);
    const connectCause = new Error("Redis connection failed");
    const connectRedis = vi.fn().mockRejectedValue(connectCause);
    const disconnectRedis = vi.fn();
    mocks.setupTestDB.mockResolvedValue({
      cleanup: cleanupDatabase,
      client: {},
    });
    mocks.RedisConnection.mockImplementation(
      class {
        public connect = connectRedis;
        public disconnect = disconnectRedis;
      } as never,
    );

    await expect(
      seed({
        suite: { config: {} },
        cacheDir: "/tmp/eval-cache",
        pluginsDir: "/tmp/eval-plugins",
      } as never),
    ).rejects.toBe(connectCause);

    expect(disconnectRedis).toHaveBeenCalledOnce();
    expect(cleanupDatabase).toHaveBeenCalledOnce();
  });

  it("preserves both a hydration failure and its cleanup failure", async () => {
    const seedFailure = new Error("Redis connection failed");
    const cleanupFailure = new Error("database cleanup failed");
    mocks.setupTestDB.mockResolvedValue({
      cleanup: vi.fn().mockRejectedValue(cleanupFailure),
      client: {},
    });
    mocks.RedisConnection.mockImplementation(
      class {
        public connect = vi.fn().mockRejectedValue(seedFailure);
        public disconnect = vi.fn();
      } as never,
    );

    await expect(
      seed({
        suite: { config: {} },
        cacheDir: "/tmp/eval-cache",
        pluginsDir: "/tmp/eval-plugins",
      } as never),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [
        seedFailure,
        expect.objectContaining({ errors: [cleanupFailure] }),
      ],
    });
  });

  it("restores eval-owned process state and cleans each database before a later seed", async () => {
    const cause = new Error("seed hydration failed");
    const previousQueue = {};
    const restorePreviousQueue = installVectorizationQueue(
      previousQueue as never,
    );
    const previousPermissionEngine = {};
    globalThis.__PERMISSION_ENGINE__ = previousPermissionEngine as never;
    const previousLoader = {} as PluginLoader;
    const previousManager = PluginManager.get("GLOBAL", "", previousLoader);
    const databases: Array<{ cleanup: ReturnType<typeof vi.fn> }> = [];
    mocks.setupTestDB.mockImplementation(async () => {
      const db = { cleanup: vi.fn().mockResolvedValue(undefined), client: {} };
      databases.push(db);
      return db;
    });
    const connectRedis = vi.fn();
    const disconnectRedis = vi.fn();
    mocks.RedisConnection.mockImplementation(
      class {
        public connect = connectRedis;
        public disconnect = disconnectRedis;
      } as never,
    );
    mocks.executeCommand.mockRejectedValue(cause);
    const options = {
      suite: {
        config: { plugins: { loader: "test", overrides: [] } },
      },
      cacheDir: "/tmp/eval-cache",
      pluginsDir: "/tmp/eval-plugins",
    } as never;

    await expect(seed(options)).rejects.toBe(cause);
    await expect(seed(options)).rejects.toBe(cause);

    expect(databases).toHaveLength(2);
    expect(databases[0]?.cleanup).toHaveBeenCalledOnce();
    expect(databases[1]?.cleanup).toHaveBeenCalledOnce();
    expect(getVectorizationQueue()).toBe(previousQueue);
    expect(globalThis.__PERMISSION_ENGINE__).toBe(previousPermissionEngine);
    expect(PluginManager.get("GLOBAL", "", previousLoader)).toBe(
      previousManager,
    );
    restorePreviousQueue();
  });

  it("does not remove a replacement manager installed while seed is running", async () => {
    const cause = new Error("seed hydration failed");
    const cleanupDatabase = vi.fn().mockResolvedValue(undefined);
    mocks.setupTestDB.mockResolvedValue({
      cleanup: cleanupDatabase,
      client: {},
    });
    const connectRedis = vi.fn();
    const disconnectRedis = vi.fn();
    mocks.RedisConnection.mockImplementation(
      class {
        public connect = connectRedis;
        public disconnect = disconnectRedis;
      } as never,
    );
    const previousLoader = {} as PluginLoader;
    const previousManager = PluginManager.get("GLOBAL", "", previousLoader);
    const replacementLoader = {} as PluginLoader;
    let replacementInstallation: ScopedPluginManagerInstallation | undefined;
    mocks.executeCommand.mockImplementation(() => {
      replacementInstallation = PluginManager.installScoped(
        "GLOBAL",
        "",
        replacementLoader,
      );
      throw cause;
    });

    await expect(
      seed({
        suite: {
          config: { plugins: { loader: "test", overrides: [] } },
        },
        cacheDir: "/tmp/eval-cache",
        pluginsDir: "/tmp/eval-plugins",
      } as never),
    ).rejects.toBe(cause);

    expect(cleanupDatabase).toHaveBeenCalledOnce();
    expect(replacementInstallation).toBeDefined();
    expect(PluginManager.get("GLOBAL", "", replacementLoader)).toBe(
      replacementInstallation?.manager,
    );

    replacementInstallation?.restore();
    expect(PluginManager.get("GLOBAL", "", previousLoader)).toBe(
      previousManager,
    );
  });
});
