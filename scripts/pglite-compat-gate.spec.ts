import { describe, expect, it, vi } from "vitest";

import {
  type CapabilityCheck,
  checkSql,
  classifyFromChecks,
  evaluatePgliteGate,
  pgliteGateExitCode,
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

  it("passes when core SQL works and only documented search probes are unavailable", () => {
    const report = evaluatePgliteGate([
      available("pglite package"),
      available("basic sql"),
      available("transactions"),
      available("on conflict returning"),
      available("skip locked"),
      missing("pgvector extension"),
      missing("pg_trgm extension"),
      missing("rum extension"),
      missing("zhparser extension"),
      missing("fts parser"),
      missing("rum ranking"),
      missing("hnsw index"),
    ]);

    expect(report.passed).toBe(true);
    expect(report.failures).toEqual([]);
    expect(report.expectedUnsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "pgvector extension" }),
        expect.objectContaining({ name: "rum ranking" }),
      ]),
    );
    expect(pgliteGateExitCode(report)).toBe(0);
  });

  it("fails nonzero when a required capability regresses", () => {
    const report = evaluatePgliteGate([
      available("pglite package"),
      available("basic sql"),
      missing("transactions"),
      available("on conflict returning"),
      available("skip locked"),
    ]);

    expect(report.passed).toBe(false);
    expect(report.failures).toEqual([
      expect.objectContaining({
        name: "transactions",
        details: "transactions is unavailable",
      }),
    ]);
    expect(pgliteGateExitCode(report)).toBe(1);
  });
});
