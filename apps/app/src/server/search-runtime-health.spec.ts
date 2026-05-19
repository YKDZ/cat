import { describe, expect, it, vi } from "vitest";

import {
  assertSearchRuntimeHealth,
  detectSearchRuntimeHealth,
} from "./search-runtime-health";

type QueryRows = Array<Record<string, string>>;

type FakeDb = {
  execute: ReturnType<typeof vi.fn>;
};

const createFakeDb = (responses: QueryRows[]): FakeDb => ({
  execute: vi.fn(async () => ({ rows: responses.shift() ?? [] })),
});

describe("search runtime health", () => {
  it("classifies full search runtime when all capabilities are present", async () => {
    const db = createFakeDb([
      [
        { extname: "vector" },
        { extname: "pg_trgm" },
        { extname: "rum" },
        { extname: "zhparser" },
      ],
      [{ cfgname: "cat_zh_hans" }],
      [{ proname: "rum_ts_score" }],
    ]);

    const summary = await detectSearchRuntimeHealth(db);

    expect(summary.searchLevel).toBe("full-search-runtime");
    expect(summary.disabledFeatures).toEqual([]);
    expect(summary.warnings).toEqual([]);
  });

  it("classifies partial runtime when only vector or pg_trgm is available", async () => {
    const db = createFakeDb([[{ extname: "vector" }], [], []]);

    const summary = await detectSearchRuntimeHealth(db);

    expect(summary.searchLevel).toBe("partial-search-runtime");
    expect(summary.disabledFeatures).toEqual(
      expect.arrayContaining([
        "rum-index-ranking",
        "zhparser-full-text",
        "bm25-memory-recall",
      ]),
    );
    expect(summary.warnings).toEqual([
      "database search capability degraded to partial-search-runtime",
    ]);
  });

  it("classifies basic runtime when vector and pg_trgm are both unavailable", async () => {
    const db = createFakeDb([[], [], []]);

    const summary = await detectSearchRuntimeHealth(db);

    expect(summary.searchLevel).toBe("basic-db-runtime");
    expect(summary.disabledFeatures).toEqual(
      expect.arrayContaining([
        "pgvector",
        "rum-index-ranking",
        "zhparser-full-text",
        "bm25-memory-recall",
      ]),
    );
  });

  it("allows lower requirements such as basic-db-runtime", async () => {
    const db = createFakeDb([[{ extname: "pg_trgm" }], [], []]);

    await expect(
      assertSearchRuntimeHealth(db, {
        requiredSearchLevel: "basic-db-runtime",
      }),
    ).resolves.toMatchObject({ searchLevel: "partial-search-runtime" });
  });

  it("throws a clear error when full runtime is required but only partial is available", async () => {
    const db = createFakeDb([[{ extname: "vector" }], [], []]);

    await expect(
      assertSearchRuntimeHealth(db, {
        requiredSearchLevel: "full-search-runtime",
      }),
    ).rejects.toThrow(/does not satisfy required full-search-runtime/i);
  });
});
