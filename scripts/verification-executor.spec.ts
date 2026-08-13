import { describe, expect, it, vi } from "vitest";

import {
  executeVerificationPlan,
  verificationExecutorCleanupHeadroomMs,
  verificationExecutorTimeoutBudget,
  type VerificationNodeRegistry,
} from "./verification-executor.ts";
import type {
  VerificationNode,
  VerificationPlan,
} from "./verification-plan.ts";

const node = (
  id: string,
  options: Partial<VerificationNode> = {},
): VerificationNode => ({
  dependencies: [],
  id,
  immutableInputs: ["source-sha"],
  lane: id,
  requiredArtifacts: [],
  requiredRecord: true,
  resourceLane: "cpu",
  timeoutClass: "short",
  ...options,
});

const plan = (...nodes: VerificationNode[]): VerificationPlan => ({
  digest: "a".repeat(64),
  nodes,
  schemaVersion: 1,
});

const executorOptions = {
  cleanupTimeoutMs: 100,
  sourceSha: "local-sha",
  timeoutMs: { long: 100, short: 100, standard: 100 },
};

describe("Verification Executor", () => {
  it("reserves cleanup headroom within the temporary CI job budget", () => {
    const totalLongNodeBudget =
      verificationExecutorTimeoutBudget.long +
      verificationExecutorCleanupHeadroomMs.handlerSettlement +
      verificationExecutorCleanupHeadroomMs.nodeCleanup;

    expect(totalLongNodeBudget).toBeLessThanOrEqual(50 * 60_000);
    expect(verificationExecutorTimeoutBudget.short).toBeLessThanOrEqual(
      3 * 60_000,
    );
    expect(verificationExecutorTimeoutBudget.standard).toBeLessThanOrEqual(
      12 * 60_000,
    );
  });
  it("runs at most two independent nodes at once", async () => {
    let active = 0;
    let maximum = 0;
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const registry: VerificationNodeRegistry = Object.fromEntries(
      ["one", "two", "three"].map((id) => [
        id,
        async () => {
          active += 1;
          maximum = Math.max(maximum, active);
          await wait;
          active -= 1;
        },
      ]),
    );

    const running = executeVerificationPlan(
      plan(node("one"), node("two"), node("three")),
      registry,
      executorOptions,
    );
    await vi.waitFor(() => expect(active).toBe(2));
    release?.();

    await expect(running).resolves.toMatchObject({
      records: expect.any(Array),
    });
    expect(maximum).toBe(2);
  });

  it("runs a dependency-complete selected subgraph without unrelated nodes", async () => {
    const selectedPlan = plan(
      node("build"),
      node("package", { dependencies: ["build"] }),
      node("unrelated"),
    );
    const calls: string[] = [];
    const registry = Object.fromEntries(
      selectedPlan.nodes.map((entry) => [
        entry.id,
        async () => {
          calls.push(entry.id);
        },
      ]),
    );

    const result = await executeVerificationPlan(selectedPlan, registry, {
      nodeIds: ["build", "package"],
      sourceSha: "source",
    });

    expect(calls).toEqual(["build", "package"]);
    expect(result.records.map((record) => record.nodeId)).toEqual([
      "build",
      "package",
    ]);
  });

  it("serializes Docker-heavy nodes while allowing a CPU sibling", async () => {
    let activeDocker = 0;
    let maximumDocker = 0;
    let active = 0;
    let release: (() => void) | undefined;
    const wait = new Promise<void>((resolve) => {
      release = resolve;
    });
    const registry: VerificationNodeRegistry = {
      cpu: async () => {
        active += 1;
        await wait;
        active -= 1;
      },
      "docker-one": async () => {
        active += 1;
        activeDocker += 1;
        maximumDocker = Math.max(maximumDocker, activeDocker);
        await wait;
        activeDocker -= 1;
        active -= 1;
      },
      "docker-two": async () => {
        active += 1;
        activeDocker += 1;
        maximumDocker = Math.max(maximumDocker, activeDocker);
        await wait;
        activeDocker -= 1;
        active -= 1;
      },
    };

    const running = executeVerificationPlan(
      plan(
        node("cpu"),
        node("docker-one", { resourceLane: "docker" }),
        node("docker-two", { resourceLane: "docker" }),
      ),
      registry,
      executorOptions,
    );
    await vi.waitFor(() => expect(active).toBe(2));
    release?.();

    await expect(running).resolves.toBeDefined();
    expect(maximumDocker).toBe(1);
  });

  it("blocks dependents after a failure while started siblings finish", async () => {
    const started: string[] = [];
    const registry: VerificationNodeRegistry = {
      failed: async () => {
        started.push("failed");
        throw new Error("validation failed");
      },
      sibling: async () => {
        started.push("sibling");
      },
      blocked: async () => {
        started.push("blocked");
      },
    };

    const running = executeVerificationPlan(
      plan(
        node("failed"),
        node("sibling"),
        node("blocked", { dependencies: ["failed"] }),
      ),
      registry,
      executorOptions,
    );

    await expect(running).rejects.toThrow("validation failed");
    expect(started).toEqual(expect.arrayContaining(["failed", "sibling"]));
    expect(started).not.toContain("blocked");
  });

  it("writes records only after validation and reverse-order cleanup succeed", async () => {
    const events: string[] = [];
    const result = await executeVerificationPlan(
      plan(node("validated")),
      {
        validated: async (context) => {
          events.push("validation");
          context.onCleanup(async () => {
            events.push("cleanup-one");
          });
          context.onCleanup(async () => {
            events.push("cleanup-two");
          });
        },
      },
      executorOptions,
    );

    expect(events).toEqual(["validation", "cleanup-two", "cleanup-one"]);
    expect(result.records).toEqual([
      expect.objectContaining({ cleanupCompleted: true, nodeId: "validated" }),
    ]);
  });

  it("preserves validation and cleanup failures together", async () => {
    await expect(
      executeVerificationPlan(
        plan(node("broken")),
        {
          broken: async (context) => {
            context.onCleanup(async () => {
              throw new Error("cleanup failed");
            });
            throw new Error("validation failed");
          },
        },
        executorOptions,
      ),
    ).rejects.toThrow("validation failed");

    try {
      await executeVerificationPlan(
        plan(node("broken")),
        {
          broken: async (context) => {
            context.onCleanup(async () => {
              throw new Error("cleanup failed");
            });
            throw new Error("validation failed");
          },
        },
        executorOptions,
      );
    } catch (error) {
      expect(error).toBeInstanceOf(AggregateError);
      expect((error as AggregateError).errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ message: "validation failed" }),
          expect.objectContaining({ message: "cleanup failed" }),
        ]),
      );
    }
  });

  it("aborts timed out nodes before running cleanup", async () => {
    const cleanup = vi.fn();
    await expect(
      executeVerificationPlan(
        plan(node("slow")),
        {
          slow: async (context) => {
            context.onCleanup(async () => cleanup());
            await new Promise<void>((resolve) => {
              context.signal.addEventListener("abort", () => resolve(), {
                once: true,
              });
            });
          },
        },
        {
          ...executorOptions,
          timeoutMs: { long: 10, short: 10, standard: 10 },
        },
      ),
    ).rejects.toThrow("timed out");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("waits for an aborted handler to settle before consuming late cleanup", async () => {
    const cleanup = vi.fn();
    let signalAborted: (() => void) | undefined;
    const aborted = new Promise<void>((resolve) => {
      signalAborted = resolve;
    });
    let releaseHandler: (() => void) | undefined;
    const release = new Promise<void>((resolve) => {
      releaseHandler = resolve;
    });
    const running = executeVerificationPlan(
      plan(node("late-cleanup")),
      {
        "late-cleanup": async (context) => {
          await new Promise<void>((resolve) => {
            context.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
          signalAborted?.();
          await release;
          context.onCleanup(async () => cleanup());
        },
      },
      {
        ...executorOptions,
        timeoutMs: { long: 10, short: 10, standard: 10 },
      },
    );

    await aborted;
    expect(cleanup).not.toHaveBeenCalled();
    releaseHandler?.();
    await expect(running).rejects.toThrow("timed out");
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it("reports a handler that ignores its cancellation grace period", async () => {
    await expect(
      executeVerificationPlan(
        plan(node("ignores-abort")),
        {
          "ignores-abort": async () => await new Promise<void>(() => {}),
        },
        {
          ...executorOptions,
          handlerSettlementGraceMs: 10,
          timeoutMs: { long: 10, short: 10, standard: 10 },
        },
      ),
    ).rejects.toThrow("did not settle before cleanup");
  });

  it("cleans up interrupted work without producing a record", async () => {
    const controller = new AbortController();
    const cleanup = vi.fn();
    const running = executeVerificationPlan(
      plan(node("interrupted")),
      {
        interrupted: async (context) => {
          context.onCleanup(async () => cleanup());
          await new Promise<void>((resolve) => {
            context.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
        },
      },
      { ...executorOptions, signal: controller.signal },
    );

    controller.abort(new Error("stop"));
    await expect(running).rejects.toThrow("interrupted");
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
