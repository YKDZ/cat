import type {
  CacheStore,
  DrizzleDB,
  RedisConnection,
  SessionStore,
} from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";
import type { User } from "@cat/shared/schema/drizzle/user";
import type { HTTPHelpers } from "@cat/shared/utils";

/**
 * 与 `@cat/app-api` Context 结构兼容的测试上下文类型。
 * 定义在 test-utils 中以避免上层 app 与底层工具层产生循环依赖。
 */
export type TestContext = {
  user: User | null;
  sessionId: string | null;
  pluginManager: PluginManager;
  drizzleDB: DrizzleDB;
  redis: RedisConnection;
  cacheStore: CacheStore;
  sessionStore: SessionStore;
  helpers: HTTPHelpers;
};

const createMockHTTPHelpers = (): HTTPHelpers => ({
  setCookie: () => {
    /* noop */
  },
  delCookie: () => {
    /* noop */
  },
  getCookie: () => null,
  getQueryParam: () => undefined,
  getReqHeader: () => undefined,
  setResHeader: () => {
    /* noop */
  },
});

const createMockCacheStore = (): CacheStore => ({
  get: async () => null,
  set: async () => {
    /* noop */
  },
  delete: async () => {
    /* noop */
  },
  has: async () => false,
});

const createMockSessionStore = (): SessionStore => ({
  create: async () => {
    /* noop */
  },
  getField: async () => null,
  getAll: async () => null,
  destroy: async () => {
    /* noop */
  },
});

/**
 * 创建未认证的测试上下文（user 为 null）。
 *
 * 需要真实 DB 的集成测试（*.test.ts）可在 overrides 中注入 drizzleDB：
 * ```ts
 * const testDB = await setupTestDB()
 * const ctx = createTestContext({ drizzleDB: testDB })
 * ```
 */
export const createTestContext = (
  overrides?: Partial<TestContext>,
): TestContext => ({
  user: null,
  sessionId: null,
  // 集成测试须通过 overrides 注入真实句柄；单测通常不调用这些字段
  // oxlint-disable-next-line no-unsafe-type-assertion
  pluginManager: null as unknown as PluginManager,
  // oxlint-disable-next-line no-unsafe-type-assertion
  drizzleDB: null as unknown as DrizzleDB,
  // oxlint-disable-next-line no-unsafe-type-assertion
  redis: null as unknown as RedisConnection,
  cacheStore: createMockCacheStore(),
  sessionStore: createMockSessionStore(),
  helpers: createMockHTTPHelpers(),
  ...overrides,
});

/**
 * 创建已认证的测试上下文（user 为合法用户）。
 *
 * ```ts
 * const ctx = createAuthedTestContext({ email: 'admin@example.com' })
 * ```
 */
export const createAuthedTestContext = (
  user?: Partial<User>,
  overrides?: Partial<TestContext>,
): TestContext => {
  const defaultUser: User = {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Test User",
    email: "test@example.com",
    emailVerified: true,
    avatarFileId: null,
    createdAt: new Date("2024-01-01T00:00:00.000Z"),
    updatedAt: new Date("2024-01-01T00:00:00.000Z"),
  };

  return createTestContext({
    user: { ...defaultUser, ...user } as User,
    sessionId: "test-session-id",
    ...overrides,
  });
};
