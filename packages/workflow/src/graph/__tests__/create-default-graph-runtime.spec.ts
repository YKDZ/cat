import type { DrizzleClient } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { afterEach, expect, test, vi } from "vitest";

import {
  createDefaultGraphRuntime,
  getGlobalGraphRuntimeOrNull,
} from "#/graph/index.ts";
import {
  LocalizationTaskService,
  WorkflowTaskProjector,
} from "#/workflow/tasks/index.ts";

afterEach(() => {
  vi.restoreAllMocks();
  PluginManager.clear();
});

const createFakeDrizzle = (): DrizzleClient => {
  // oxlint-disable-next-line no-unsafe-type-assertion -- createDefaultGraphRuntime only wires the db handle into the checkpointer constructor in this unit test.
  return {} as DrizzleClient;
};

test("registers graphs, starts reconciliation loops, and stores the runtime singleton", async () => {
  const startProjectorLoop = vi.spyOn(
    WorkflowTaskProjector.prototype,
    "startReconciliationLoop",
  );
  const startServiceLoop = vi.spyOn(
    LocalizationTaskService.prototype,
    "startReconciliationLoop",
  );
  const runtime = createDefaultGraphRuntime(
    createFakeDrizzle(),
    PluginManager.get("GLOBAL", ""),
  );

  expect(runtime.graphRegistry.has("upsert-content-node-from-file")).toBe(true);
  expect(getGlobalGraphRuntimeOrNull()).toBe(runtime);
  expect(getGlobalGraphRuntimeOrNull()?.taskProjector).toBe(
    runtime.taskProjector,
  );
  expect(startProjectorLoop).toHaveBeenCalledOnce();
  expect(startServiceLoop).toHaveBeenCalledOnce();
  await runtime.dispose();
});

test("allows callers that drive reconciliation explicitly to disable both loops", async () => {
  const startProjectorLoop = vi.spyOn(
    WorkflowTaskProjector.prototype,
    "startReconciliationLoop",
  );
  const startServiceLoop = vi.spyOn(
    LocalizationTaskService.prototype,
    "startReconciliationLoop",
  );
  const runtime = createDefaultGraphRuntime(
    createFakeDrizzle(),
    PluginManager.get("GLOBAL", ""),
    { startReconciliationLoops: false },
  );

  expect(startProjectorLoop).not.toHaveBeenCalled();
  expect(startServiceLoop).not.toHaveBeenCalled();
  await runtime.dispose();
});
