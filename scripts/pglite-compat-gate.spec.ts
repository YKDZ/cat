import { describe, expect, it, vi } from "vitest";

import {
  type CapabilityCheck,
  checkSql,
  classifyFromChecks,
} from "./pglite-compat-gate.ts";

const available = (name: string): CapabilityCheck => ({
  name,
  status: "available",
});

const missing = (name: string): CapabilityCheck => ({
  name,
  status: "missing",
  details: `${name} is unavailable`,
});

describe("pglite compatibility gate", () => {
  it("returns a missing check when SQL execution fails", async () => {
    const query = vi.fn().mockRejectedValue(new Error("extension missing"));

    await expect(
      checkSql({ query }, "pgvector extension", "CREATE EXTENSION vector"),
    ).resolves.toMatchObject({
      name: "pgvector extension",
      status: "missing",
      details: "extension missing",
    });
    expect(query).toHaveBeenCalledOnce();
  });

  it("does not report full-search-runtime when rum ranking is missing", () => {
    const checks: CapabilityCheck[] = [
      available("pgvector extension"),
      available("pg_trgm extension"),
      available("rum extension"),
      available("zhparser extension"),
      available("fts parser"),
      missing("rum ranking"),
      available("hnsw index"),
    ];

    expect(classifyFromChecks(checks)).toBe("partial-search-runtime");
  });

  it("does not report full-search-runtime when the FTS parser is missing", () => {
    const checks: CapabilityCheck[] = [
      available("pgvector extension"),
      available("pg_trgm extension"),
      available("rum extension"),
      available("zhparser extension"),
      missing("fts parser"),
      available("rum ranking"),
      available("hnsw index"),
    ];

    expect(classifyFromChecks(checks)).toBe("partial-search-runtime");
  });
});
