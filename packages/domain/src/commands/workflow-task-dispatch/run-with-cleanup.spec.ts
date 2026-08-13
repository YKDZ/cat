import { describe, expect, it } from "vitest";

import { runWithCleanup } from "./run-with-cleanup.ts";

describe("runWithCleanup", () => {
  it("returns the operation value after successful cleanup", async () => {
    const cleanup = async (): Promise<void> => undefined;

    await expect(runWithCleanup(async () => 42, cleanup)).resolves.toBe(42);
  });

  it("rethrows the original operation error after successful cleanup", async () => {
    const operationError = new Error("operation failed");
    const cleanup = async (): Promise<void> => undefined;

    try {
      await runWithCleanup(async () => {
        throw operationError;
      }, cleanup);
      throw new Error("Expected runWithCleanup to reject.");
    } catch (error: unknown) {
      expect(error).toBe(operationError);
    }
  });

  it("throws the original cleanup error after a successful operation", async () => {
    const cleanupError = new Error("cleanup failed");

    try {
      await runWithCleanup(
        async () => 42,
        async () => {
          throw cleanupError;
        },
      );
      throw new Error("Expected runWithCleanup to reject.");
    } catch (error: unknown) {
      expect(error).toBe(cleanupError);
    }
  });

  it("preserves both original errors when operation and cleanup fail", async () => {
    const operationError = new Error("operation failed");
    const cleanupError = new Error("cleanup failed");

    try {
      await runWithCleanup(
        async () => {
          throw operationError;
        },
        async () => {
          throw cleanupError;
        },
      );
      throw new Error("Expected runWithCleanup to reject.");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(AggregateError);
      if (!(error instanceof AggregateError)) return;
      expect(error.errors).toHaveLength(2);
      expect(error.errors[0]).toBe(operationError);
      expect(error.errors[1]).toBe(cleanupError);
    }
  });
});
