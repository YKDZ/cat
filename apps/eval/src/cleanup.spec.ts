import { describe, expect, it } from "vitest";

import { runCleanupSteps } from "./cleanup.ts";

describe("runCleanupSteps", () => {
  it("attempts every cleanup in order and aggregates every cleanup failure", async () => {
    const first = new Error("first cleanup failed");
    const second = new Error("second cleanup failed");
    const calls: string[] = [];

    const result = runCleanupSteps([
      () => {
        calls.push("first");
        throw first;
      },
      () => {
        calls.push("second");
      },
      () => {
        calls.push("third");
        throw second;
      },
    ]);

    await expect(result).rejects.toMatchObject({ errors: [first, second] });
    expect(calls).toEqual(["first", "second", "third"]);
  });

  it("preserves the operation failure while still reporting cleanup failures", async () => {
    const operationFailure = new Error("operation failed");
    const cleanupFailure = new Error("cleanup failed");

    await expect(
      runCleanupSteps([() => Promise.reject(cleanupFailure)], operationFailure),
    ).rejects.toMatchObject({ errors: [operationFailure, cleanupFailure] });
  });

  it("lets resource owners reset references before a failing cleanup", async () => {
    let resource: "owned" | undefined = "owned";

    await expect(
      runCleanupSteps([
        () => {
          resource = undefined;
          throw new Error("close failed");
        },
      ]),
    ).rejects.toThrow("Eval cleanup failed");
    expect(resource).toBeUndefined();
  });
});
