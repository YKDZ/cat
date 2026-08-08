import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getStrategy: vi.fn(),
  seed: vi.fn(),
}));

vi.mock("#/seeder/index.ts", () => ({ seed: mocks.seed }));
vi.mock("./strategies/index.ts", () => ({ getStrategy: mocks.getStrategy }));

import {
  EvalInterruptedError,
  throwIfEvaluationAborted,
} from "../cancellation.ts";
import { runHarness } from "./harness.ts";

describe("runHarness cancellation", () => {
  it("cleans a seeded context exactly once when a scenario receives repeated interrupts", async () => {
    const cleanup = vi.fn().mockResolvedValue(undefined);
    const controller = new AbortController();
    mocks.seed.mockResolvedValue({
      pluginManager: {},
      refs: {},
      projectId: "project",
      glossaryId: undefined,
      memoryId: undefined,
      agentDefinitionId: undefined,
      contentNodeId: undefined,
      db: {},
      userId: "user",
      cleanup,
    });
    mocks.getStrategy.mockReturnValue({
      execute: vi.fn(async (_scenario: unknown, _testSet: unknown, ctx) => {
        controller.abort(new EvalInterruptedError());
        controller.abort(new EvalInterruptedError());
        throwIfEvaluationAborted(ctx.signal);
      }),
    });

    await expect(
      runHarness({
        suite: {
          config: {
            name: "interrupted",
            scenarios: [
              {
                type: "term-recall",
                "test-set": "cases",
                scorers: [],
              },
            ],
          },
          testSets: new Map([["cases", {}]]),
        } as never,
        cacheDir: "/tmp/cache",
        pluginsDir: "/tmp/plugins",
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(EvalInterruptedError);

    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("preserves a scenario failure when cleanup also fails", async () => {
    const scenarioFailure = new Error("scenario failed");
    const cleanupFailure = new Error("cleanup failed");
    mocks.seed.mockResolvedValue({
      pluginManager: {},
      refs: {},
      projectId: "project",
      glossaryId: undefined,
      memoryId: undefined,
      agentDefinitionId: undefined,
      contentNodeId: undefined,
      db: {},
      userId: "user",
      cleanup: vi.fn().mockRejectedValue(cleanupFailure),
    });
    mocks.getStrategy.mockReturnValue({
      execute: vi.fn().mockRejectedValue(scenarioFailure),
    });

    await expect(
      runHarness({
        suite: {
          config: {
            name: "cleanup-failure",
            scenarios: [
              { type: "term-recall", "test-set": "cases", scorers: [] },
            ],
          },
          testSets: new Map([["cases", {}]]),
        } as never,
        cacheDir: "/tmp/cache",
        pluginsDir: "/tmp/plugins",
      }),
    ).rejects.toMatchObject({
      name: "AggregateError",
      errors: [scenarioFailure, cleanupFailure],
    });
  });
});
