import type { PluginManager } from "@cat/plugin-core";
import type { TestDB } from "@cat/test-utils";

import {
  createDefaultGraphRuntime,
  type DefaultGraphRuntime,
} from "../index.ts";

export type TestGraphRuntimeFixture = {
  runtime: DefaultGraphRuntime;
  cleanupRuntimeDb: () => Promise<void>;
};

export const createTestGraphRuntime = (
  db: TestDB,
  pluginManager: PluginManager,
  options?: Parameters<typeof createDefaultGraphRuntime>[2],
): TestGraphRuntimeFixture => {
  const runtimeDb = db.openPooledClient();
  const runtime = createDefaultGraphRuntime(runtimeDb.client, pluginManager, {
    startReconciliationLoops: false,
    ...options,
  });
  return { runtime, cleanupRuntimeDb: runtimeDb.cleanup };
};

export const cleanupTestGraphFixture = async (
  fixture: TestGraphRuntimeFixture | undefined,
  db: Pick<TestDB, "cleanup"> | undefined,
): Promise<void> => {
  const cleanupSteps = [
    fixture ? async () => await fixture.runtime.dispose() : undefined,
    fixture?.cleanupRuntimeDb,
    db?.cleanup,
  ];
  const errors: unknown[] = [];
  for (const cleanup of cleanupSteps) {
    if (!cleanup) continue;
    try {
      // Cleanup order protects the child schema while every step remains best-effort.
      // oxlint-disable-next-line no-await-in-loop
      await cleanup();
    } catch (error) {
      errors.push(error);
    }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, "Test graph fixture cleanup failed.");
  }
};
