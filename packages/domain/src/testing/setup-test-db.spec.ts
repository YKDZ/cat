import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  clientCount: 0,
  dropAttempts: 0,
  endAttempts: 0,
  endCalls: 0,
  error: new Error("setup failed"),
  mode: "success" as
    | "concurrent-search-path"
    | "drop-retry"
    | "end-retry"
    | "success",
}));

vi.mock("@cat/db", () => ({ relations: {} }));
vi.mock("drizzle-orm/node-postgres", () => ({ drizzle: vi.fn(() => ({})) }));
vi.mock("drizzle-kit/api-postgres", () => ({
  generateDrizzleJson: vi.fn(async () => ({})),
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
      if (statement === "SELECT current_schema() AS schema_name") {
        return { rows: [{ schema_name: "test_schema" }] };
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
  await (await import("./setup-test-db.ts")).setupTestDB();

describe("domain setupTestDB cleanup", () => {
  beforeEach(() => {
    state.clientCount = 0;
    state.dropAttempts = 0;
    state.endAttempts = 0;
    state.endCalls = 0;
    state.error = new Error("setup failed");
    state.mode = "success";
    vi.resetModules();
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
    const db = await setupTestDatabase();

    await db.cleanup();
    await db.cleanup();

    expect(state.dropAttempts).toBe(1);
    expect(state.endCalls).toBe(1);
  });
});
