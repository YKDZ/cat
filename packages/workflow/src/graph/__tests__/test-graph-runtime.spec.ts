import { describe, expect, it, vi } from "vitest";

import type { TestGraphRuntimeFixture } from "../testing/test-graph-runtime.ts";
import { cleanupTestGraphFixture } from "../testing/test-graph-runtime.ts";

const fixture = (
  dispose: () => Promise<void>,
  cleanupRuntimeDb: () => Promise<void>,
): TestGraphRuntimeFixture =>
  ({ runtime: { dispose }, cleanupRuntimeDb }) as TestGraphRuntimeFixture;

describe("cleanupTestGraphFixture", () => {
  it("attempts runtime, pooled client, and primary database cleanup in order", async () => {
    const calls: string[] = [];
    const runtimeFixture = fixture(
      async () => {
        calls.push("runtime");
      },
      async () => {
        calls.push("pool");
      },
    );
    const db = {
      cleanup: async () => {
        calls.push("database");
      },
    };

    await cleanupTestGraphFixture(runtimeFixture, db);

    expect(calls).toEqual(["runtime", "pool", "database"]);
  });

  it("attempts every step and aggregates failures in order", async () => {
    const runtimeError = new Error("runtime dispose failed");
    const poolError = new Error("pool cleanup failed");
    const databaseError = new Error("database cleanup failed");
    const runtimeFixture = fixture(
      vi.fn().mockRejectedValue(runtimeError),
      vi.fn().mockRejectedValue(poolError),
    );
    const cleanupDatabase = vi.fn().mockRejectedValue(databaseError);

    const cleanup = cleanupTestGraphFixture(runtimeFixture, {
      cleanup: cleanupDatabase,
    });

    await expect(cleanup).rejects.toMatchObject({
      errors: [runtimeError, poolError, databaseError],
    });
    expect(runtimeFixture.runtime.dispose).toHaveBeenCalledOnce();
    expect(runtimeFixture.cleanupRuntimeDb).toHaveBeenCalledOnce();
    expect(cleanupDatabase).toHaveBeenCalledOnce();
  });

  it("rethrows one cleanup failure without wrapping it", async () => {
    const poolError = new Error("pool cleanup failed");

    await expect(
      cleanupTestGraphFixture(
        fixture(vi.fn().mockResolvedValue(undefined), async () => {
          throw poolError;
        }),
        undefined,
      ),
    ).rejects.toBe(poolError);
  });

  it("is safe when setup did not initialize either resource", async () => {
    await expect(
      cleanupTestGraphFixture(undefined, undefined),
    ).resolves.toBeUndefined();
  });
});
