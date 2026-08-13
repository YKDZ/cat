import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetDbHandle,
  mockGetCacheStore,
  mockGetSessionStore,
  mockGetCurrentRedisHandle,
  mockGetRedisHandle,
  mockLoadUserSystemRoles,
  mockUserFromSessionId,
  mockResolveApiKey,
  mockUpdateApiKeyLastUsedAsync,
  mockGenerateCsrfToken,
  mockPluginManager,
  mockDrizzleDB,
  mockCacheStore,
  mockSessionStore,
} = vi.hoisted(() => ({
  mockGetDbHandle: vi.fn(),
  mockGetCacheStore: vi.fn(),
  mockGetSessionStore: vi.fn(),
  mockGetCurrentRedisHandle: vi.fn(),
  mockGetRedisHandle: vi.fn(),
  mockLoadUserSystemRoles: vi.fn(),
  mockUserFromSessionId: vi.fn(),
  mockResolveApiKey: vi.fn(),
  mockUpdateApiKeyLastUsedAsync: vi.fn(),
  mockGenerateCsrfToken: vi.fn(),
  mockPluginManager: { kind: "plugin-manager" },
  mockDrizzleDB: { client: {} },
  mockCacheStore: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
  },
  mockSessionStore: {
    create: vi.fn().mockResolvedValue(undefined),
    getField: vi.fn().mockResolvedValue(null),
    getAll: vi.fn().mockResolvedValue(null),
    destroy: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    getDbHandle: mockGetDbHandle,
    getCacheStore: mockGetCacheStore,
    getSessionStore: mockGetSessionStore,
    getCurrentRedisHandle: mockGetCurrentRedisHandle,
    getRedisHandle: mockGetRedisHandle,
  };
});

vi.mock("@cat/permissions", () => ({
  loadUserSystemRoles: mockLoadUserSystemRoles,
}));

vi.mock("@cat/plugin-core", () => ({
  PluginManager: {
    get: vi.fn(() => mockPluginManager),
  },
}));

vi.mock("@cat/server-shared", () => ({
  userFromSessionId: mockUserFromSessionId,
}));

vi.mock("./api-key.ts", () => ({
  resolveApiKey: mockResolveApiKey,
  updateApiKeyLastUsedAsync: mockUpdateApiKeyLastUsedAsync,
}));

vi.mock("#/middleware/csrf.ts", () => ({
  generateCsrfToken: mockGenerateCsrfToken,
}));

import { getContext } from "./context.ts";
import {
  publishRuntimeCapabilities,
  resetRuntimeCapabilitiesForTest,
} from "./runtime-capabilities.ts";

describe("getContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetRuntimeCapabilitiesForTest();
    mockGetDbHandle.mockResolvedValue(mockDrizzleDB);
    mockGetCacheStore.mockReturnValue(mockCacheStore);
    mockGetSessionStore.mockReturnValue(mockSessionStore);
    mockGetCurrentRedisHandle.mockReturnValue(undefined);
    mockGetRedisHandle.mockResolvedValue({});
    mockLoadUserSystemRoles.mockResolvedValue([]);
    mockUserFromSessionId.mockResolvedValue(null);
    mockResolveApiKey.mockResolvedValue(null);
    mockGenerateCsrfToken.mockReturnValue("csrf-token");
    publishRuntimeCapabilities({
      baseURL: "http://localhost:3000/",
      cacheStore: mockCacheStore,
      drizzleDB: mockDrizzleDB as never,
      name: "CAT",
      pluginManager: mockPluginManager as never,
      redis: undefined,
      sessionStore: mockSessionStore,
    });
  });

  it("uses host capabilities without creating realm-local runtime services", async () => {
    const responseHeaders = new Headers();

    const context = await getContext(
      new Request("https://example.com/api/rpc"),
      responseHeaders,
    );

    expect(mockGetRedisHandle).not.toHaveBeenCalled();
    expect(mockGetCurrentRedisHandle).not.toHaveBeenCalled();
    expect(context.redis).toBeUndefined();
    expect(context.drizzleDB).toBe(mockDrizzleDB);
    expect(context.pluginManager).toBe(mockPluginManager);
    expect(context.cacheStore).toBe(mockCacheStore);
    expect(context.sessionStore).toBe(mockSessionStore);
    expect(responseHeaders.get("set-cookie")).toContain("csrfToken=csrf-token");
  });

  it("exposes the current Redis handle when one is already initialized", async () => {
    const redisHandle = { redis: {} };
    resetRuntimeCapabilitiesForTest();
    publishRuntimeCapabilities({
      baseURL: "http://localhost:3000/",
      cacheStore: mockCacheStore,
      drizzleDB: mockDrizzleDB as never,
      name: "CAT",
      pluginManager: mockPluginManager as never,
      redis: redisHandle as never,
      sessionStore: mockSessionStore,
    });

    const context = await getContext(
      new Request("https://example.com/api/rpc"),
      new Headers(),
    );

    expect(context.redis).toBe(redisHandle);
  });
});
