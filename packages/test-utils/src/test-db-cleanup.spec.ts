import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clientCount: 0,
  dropAttempts: 0,
  endAttempts: 0,
  endCalls: 0,
  error: new Error("setup failed"),
  mode: "sync-snapshot" as
    | "async-search-path"
    | "concurrent-search-path"
    | "drop-retry"
    | "end-retry"
    | "success"
    | "sync-snapshot",
  queries: [] as string[],
  poolConfigs: [] as unknown[],
  poolCount: 0,
  poolEndCalls: 0,
  cleanupOrder: [] as string[],
  clientEndErrors: {} as Record<number, Error[]>,
  poolEndErrors: {} as Record<number, Error[]>,
  dropErrors: [] as Error[],
}));

vi.mock("@cat/db", () => ({ relations: {} }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock("drizzle-kit/api-postgres", () => ({
  generateDrizzleJson: vi.fn(() => {
    if (state.mode === "sync-snapshot") throw state.error;
    return Promise.resolve({});
  }),
  generateMigration: vi.fn(async () => []),
}));
vi.mock("pg", () => ({
  Client: class {
    private readonly id = ++state.clientCount;

    async connect(): Promise<void> {}

    async end(): Promise<void> {
      state.endCalls += 1;
      state.endAttempts += 1;
      state.cleanupOrder.push(`client:${this.id}`);
      const configuredError = state.clientEndErrors[this.id]?.shift();
      if (configuredError) throw configuredError;
      if (
        state.mode === "end-retry" &&
        this.id === 1 &&
        state.endAttempts === 1
      )
        throw state.error;
    }

    async query(statement: string): Promise<unknown> {
      state.queries.push(statement);
      if (statement === "SELECT current_schema() AS schema_name") {
        return { rows: [{ schema_name: "test_schema" }] };
      }
      if (
        state.mode === "async-search-path" &&
        statement.startsWith("SET search_path")
      ) {
        throw state.error;
      }
      if (
        state.mode === "concurrent-search-path" &&
        this.id === 2 &&
        statement.startsWith("SET search_path")
      ) {
        throw state.error;
      }
      if (statement.startsWith("DROP SCHEMA")) {
        state.dropAttempts += 1;
        state.cleanupOrder.push("schema");
        const configuredError = state.dropErrors.shift();
        if (configuredError) throw configuredError;
        if (state.mode === "drop-retry" && state.dropAttempts === 1)
          throw state.error;
      }
      return undefined;
    }
  },
  Pool: class {
    private readonly id = ++state.poolCount;

    constructor(config: unknown) {
      state.poolConfigs.push(config);
    }

    async end(): Promise<void> {
      state.poolEndCalls += 1;
      state.cleanupOrder.push(`pool:${this.id}`);
      const configuredError = state.poolEndErrors[this.id]?.shift();
      if (configuredError) throw configuredError;
    }
  },
}));

const setupTestDatabase = async () =>
  await (await import("./test-db.ts")).setupTestDB();

describe("setupTestDB failed setup cleanup", () => {
  beforeEach(() => {
    state.clientCount = 0;
    state.dropAttempts = 0;
    state.endAttempts = 0;
    state.endCalls = 0;
    state.error = new Error("setup failed");
    state.mode = "sync-snapshot";
    state.queries = [];
    state.poolConfigs = [];
    state.poolCount = 0;
    state.poolEndCalls = 0;
    state.cleanupOrder = [];
    state.clientEndErrors = {};
    state.poolEndErrors = {};
    state.dropErrors = [];
    vi.resetModules();
  });

  it("drops the created schema when snapshot generation throws synchronously", async () => {
    await expect(setupTestDatabase()).rejects.toBe(state.error);

    expect(
      state.queries.filter((query) => query.startsWith("CREATE SCHEMA")),
    ).toHaveLength(1);
    expect(
      state.queries.filter((query) => query.startsWith("DROP SCHEMA")),
    ).toHaveLength(1);
    expect(state.endCalls).toBe(1);
  });

  it("drops the created schema when search path setup rejects asynchronously", async () => {
    state.mode = "async-search-path";

    await expect(setupTestDatabase()).rejects.toBe(state.error);

    expect(
      state.queries.filter((query) => query.startsWith("CREATE SCHEMA")),
    ).toHaveLength(1);
    expect(
      state.queries.filter((query) => query.startsWith("DROP SCHEMA")),
    ).toHaveLength(1);
    expect(state.endCalls).toBe(1);
  });

  it("retries a failed schema drop without closing the client before retry", async () => {
    state.mode = "drop-retry";
    const db = await setupTestDatabase();

    const first = db.cleanup();
    const concurrent = db.cleanup();
    await expect(first).rejects.toBe(state.error);
    await expect(concurrent).rejects.toBe(state.error);
    expect(state.dropAttempts).toBe(1);
    expect(state.endCalls).toBe(0);

    await expect(db.cleanup()).resolves.toBeUndefined();
    expect(state.dropAttempts).toBe(2);
    expect(state.endCalls).toBe(1);
  });

  it("closes a concurrent client when its search path setup fails", async () => {
    state.mode = "concurrent-search-path";
    const db = await setupTestDatabase();

    await expect(db.openConcurrentClient()).rejects.toBe(state.error);
    expect(state.endCalls).toBe(1);

    await db.cleanup();
    expect(state.endCalls).toBe(2);
  });

  it("preserves setup and cleanup errors and lets root cleanup retry the client", async () => {
    state.mode = "concurrent-search-path";
    const cleanupError = new Error("concurrent cleanup failed once");
    state.clientEndErrors[2] = [cleanupError];
    const db = await setupTestDatabase();

    const opening = db.openConcurrentClient();
    await expect(opening).rejects.toMatchObject({
      errors: [state.error, cleanupError],
    });

    await expect(db.cleanup()).resolves.toBeUndefined();
    expect(state.cleanupOrder).toEqual([
      "client:2",
      "client:2",
      "schema",
      "client:1",
    ]);
  });

  it("opens a pool whose every connection uses the isolated schema", async () => {
    state.mode = "success";
    const db = await setupTestDatabase();

    const pooled = db.openPooledClient();

    expect(state.poolConfigs).toEqual([
      expect.objectContaining({
        connectionString: "postgres://user:pass@localhost:5432/cat",
        options: expect.stringMatching(
          /^-c search_path=test_[a-f0-9_]+,public$/,
        ),
      }),
    ]);
    await pooled.cleanup();
    await pooled.cleanup();
    expect(state.poolEndCalls).toBe(1);

    await db.cleanup();
  });

  it("makes explicit concurrent client cleanup idempotent", async () => {
    state.mode = "success";
    const db = await setupTestDatabase();
    const concurrent = await db.openConcurrentClient();

    await concurrent.cleanup();
    await concurrent.cleanup();

    expect(state.cleanupOrder).toEqual(["client:2"]);
    await db.cleanup();
  });

  it("closes registered concurrent clients and pools during root cleanup", async () => {
    state.mode = "success";
    const db = await setupTestDatabase();
    await db.openConcurrentClient();
    db.openPooledClient();

    await db.cleanup();

    expect(state.cleanupOrder).toEqual([
      "client:2",
      "pool:1",
      "schema",
      "client:1",
    ]);
  });

  it("retries failed explicit child cleanup from root cleanup", async () => {
    state.mode = "success";
    const childError = new Error("pool close failed once");
    state.poolEndErrors[1] = [childError];
    const db = await setupTestDatabase();
    const pooled = db.openPooledClient();

    await expect(pooled.cleanup()).rejects.toBe(childError);
    await expect(db.cleanup()).resolves.toBeUndefined();

    expect(state.poolEndCalls).toBe(2);
  });

  it("attempts every child and schema cleanup when one child fails", async () => {
    state.mode = "success";
    const childError = new Error("first child failed");
    state.poolEndErrors[1] = [childError];
    const db = await setupTestDatabase();
    db.openPooledClient();
    db.openPooledClient();

    await expect(db.cleanup()).rejects.toBe(childError);

    expect(state.cleanupOrder).toEqual([
      "pool:1",
      "pool:2",
      "schema",
      "client:1",
    ]);
    await expect(db.cleanup()).resolves.toBeUndefined();
    expect(state.cleanupOrder.at(-1)).toBe("pool:1");
  });

  it("aggregates child and schema cleanup errors in attempt order", async () => {
    state.mode = "success";
    const concurrentError = new Error("concurrent close failed");
    const poolError = new Error("pool close failed");
    const schemaError = new Error("schema drop failed");
    state.clientEndErrors[2] = [concurrentError];
    state.poolEndErrors[1] = [poolError];
    state.dropErrors = [schemaError];
    const db = await setupTestDatabase();
    await db.openConcurrentClient();
    db.openPooledClient();

    const cleanup = db.cleanup();
    await expect(cleanup).rejects.toBeInstanceOf(AggregateError);
    await expect(cleanup).rejects.toMatchObject({
      errors: [concurrentError, poolError, schemaError],
    });
  });

  it("retries client shutdown after the schema has already dropped", async () => {
    state.mode = "end-retry";
    const db = await setupTestDatabase();

    await expect(db.cleanup()).rejects.toBe(state.error);
    expect(state.dropAttempts).toBe(1);
    expect(state.endCalls).toBe(1);

    await expect(db.cleanup()).resolves.toBeUndefined();
    expect(state.dropAttempts).toBe(1);
    expect(state.endCalls).toBe(2);
  });

  it("does not drop or close again after successful cleanup", async () => {
    state.mode = "success";
    const db = await setupTestDatabase();

    await db.cleanup();
    await db.cleanup();

    expect(state.dropAttempts).toBe(1);
    expect(state.endCalls).toBe(1);
  });
});
