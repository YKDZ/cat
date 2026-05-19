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

vi.mock("@/middleware/csrf.ts", () => ({
  generateCsrfToken: mockGenerateCsrfToken,
}));

import { getContext } from "./context";

describe("getContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDbHandle.mockResolvedValue({ client: {} });
    mockGetCacheStore.mockReturnValue(mockCacheStore);
    mockGetSessionStore.mockReturnValue(mockSessionStore);
    mockGetCurrentRedisHandle.mockReturnValue(undefined);
    mockGetRedisHandle.mockResolvedValue({});
    mockLoadUserSystemRoles.mockResolvedValue([]);
    mockUserFromSessionId.mockResolvedValue(null);
    mockResolveApiKey.mockResolvedValue(null);
    mockGenerateCsrfToken.mockReturnValue("csrf-token");
  });

  it("reuses initialized cache/session stores without creating a Redis connection", async () => {
    const responseHeaders = new Headers();

    const context = await getContext(
      new Request("https://example.com/api/rpc"),
      responseHeaders,
    );

    expect(mockGetRedisHandle).not.toHaveBeenCalled();
    expect(mockGetCurrentRedisHandle).toHaveBeenCalledOnce();
    expect(context.redis).toBeUndefined();
    expect(context.cacheStore).toBe(mockCacheStore);
    expect(context.sessionStore).toBe(mockSessionStore);
    expect(responseHeaders.get("set-cookie")).toContain("csrfToken=csrf-token");
  });

  it("exposes the current Redis handle when one is already initialized", async () => {
    const redisHandle = { redis: {} };
    mockGetCurrentRedisHandle.mockReturnValue(redisHandle);

    const context = await getContext(
      new Request("https://example.com/api/rpc"),
      new Headers(),
    );

    expect(context.redis).toBe(redisHandle);
  });
});
