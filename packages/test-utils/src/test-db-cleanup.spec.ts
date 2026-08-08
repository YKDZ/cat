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
        if (state.mode === "drop-retry" && state.dropAttempts === 1)
          throw state.error;
      }
      return undefined;
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
