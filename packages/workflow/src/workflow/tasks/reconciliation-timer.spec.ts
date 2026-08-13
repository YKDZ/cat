import * as domain from "@cat/domain";
import type { DbHandle } from "@cat/domain";
import type { PluginManager } from "@cat/plugin-core";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Checkpointer } from "#/graph/checkpointer/index.ts";
import type { AgentEventBus } from "#/graph/event-bus.ts";
import type { Scheduler } from "#/graph/scheduler.ts";
import { defaultWorkflowLogger } from "#/graph/workflow-logger.ts";

import { LocalizationTaskService } from "./localization-task-service.ts";
import { WorkflowTaskProjector } from "./workflow-task-projector.ts";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workflow task reconciliation timers", () => {
  it("serializes timer rounds and waits for an in-flight renewal before disposal", async () => {
    const timers = new Map<object, () => void>();
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      callback: Parameters<typeof setInterval>[0],
    ) => {
      const timer = { unref: () => undefined };
      if (typeof callback === "function") timers.set(timer, callback);
      return timer as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(((timer) => {
      timers.delete(timer as unknown as object);
    }) as typeof clearInterval);

    let releaseRenewal: (() => void) | undefined;
    const renewal = new Promise<void>((resolve) => {
      releaseRenewal = resolve;
    });
    const ownerId = "00000000-0000-4000-8000-000000000001";
    const dispatchId = "00000000-0000-4000-8000-000000000002";
    const renew = vi
      .spyOn(domain, "executeCommand")
      .mockImplementation(async (_ctx, command) => {
        if (command === domain.renewWorkflowTaskDispatch) {
          await renewal;
          return true;
        }
        if (command === domain.claimWorkflowTaskDispatch) return null;
        throw new Error("Unexpected task-dispatch command.");
      });
    const list = vi
      .spyOn(domain, "executeQuery")
      .mockImplementation(async (_ctx, query) => {
        if (query === domain.listLiveWorkflowTaskDispatchesOwnedBy) return [];
        throw new Error("Unexpected task-dispatch query.");
      });
    const service = new LocalizationTaskService({
      db: {} as DbHandle,
      pluginManager: {} as PluginManager,
      runtime: { scheduler: {} as Scheduler },
      ownerId,
    });
    (
      service as unknown as {
        ownedDispatchEpochs: Map<string, number>;
      }
    ).ownedDispatchEpochs.set(dispatchId, 1);

    try {
      service.startReconciliationLoop();
      const tick = [...timers.values()][0];
      if (!tick) throw new Error("Reconciliation timer is missing.");
      tick();
      tick();
      tick();
      await vi.waitFor(() => {
        expect(renew).toHaveBeenCalledTimes(1);
      });

      let disposed = false;
      const disposal = service.dispose().then(() => {
        disposed = true;
      });
      await Promise.resolve();
      expect(disposed).toBe(false);

      releaseRenewal?.();
      await disposal;
      expect(renew).toHaveBeenCalledTimes(1);
      expect(list).not.toHaveBeenCalled();
      expect(timers).toHaveLength(0);
    } finally {
      releaseRenewal?.();
      await service.dispose();
    }
  });

  it("logs rejected service and projector reconciliation, then silences disposed callbacks", async () => {
    const timers = new Map<object, () => void>();
    vi.spyOn(globalThis, "setInterval").mockImplementation(((
      callback: Parameters<typeof setInterval>[0],
    ) => {
      const timer = { unref: () => undefined };
      if (typeof callback === "function") timers.set(timer, callback);
      return timer as unknown as ReturnType<typeof setInterval>;
    }) as typeof setInterval);
    vi.spyOn(globalThis, "clearInterval").mockImplementation(((timer) => {
      timers.delete(timer as unknown as object);
    }) as typeof clearInterval);
    const logger = vi.spyOn(defaultWorkflowLogger, "scheduler");
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    const projector = new WorkflowTaskProjector({
      db: {} as DbHandle,
      eventBus: {
        subscribe: () => () => undefined,
      } as unknown as AgentEventBus,
      checkpointer: {} as Checkpointer,
      scheduler: {} as Scheduler,
    });
    const service = new LocalizationTaskService({
      db: {} as DbHandle,
      pluginManager: {} as PluginManager,
      runtime: { scheduler: {} as Scheduler },
    });
    vi.spyOn(projector, "reconcile").mockRejectedValue(
      new Error("projector retry"),
    );
    vi.spyOn(
      service as unknown as { reconcileDispatches: () => Promise<void> },
      "reconcileDispatches",
    ).mockRejectedValue(new Error("service retry"));
    try {
      projector.install();
      projector.startReconciliationLoop();
      service.startReconciliationLoop();
      const callbacks = [...timers.values()];
      expect(callbacks).toHaveLength(2);
      callbacks.forEach((callback) => callback());

      await vi.waitFor(() => {
        expect(logger).toHaveBeenCalledWith("task-projector:reconcile:error", {
          error: "projector retry",
        });
      });
      await vi.waitFor(() => {
        expect(logger).toHaveBeenCalledWith("task-dispatch:reconcile:error", {
          error: "service retry",
        });
      });
      expect(unhandled).toEqual([]);

      await projector.dispose();
      await service.dispose();
      callbacks.forEach((callback) => callback());
      await Promise.resolve();
      expect(timers.size).toBe(0);
      expect(logger).toHaveBeenCalledTimes(2);
    } finally {
      process.off("unhandledRejection", onUnhandled);
      await projector.dispose();
      await service.dispose();
    }
  });
});
