import type { DrizzleClient } from "@cat/domain";

import { PluginManager } from "@cat/plugin-core";
import { afterEach, expect, test } from "vitest";

import { createDefaultGraphRuntime } from "@/graph";

afterEach(() => {
  PluginManager.clear();
});

const createFakeDrizzle = (): DrizzleClient => {
  // oxlint-disable-next-line no-unsafe-type-assertion -- createDefaultGraphRuntime only wires the db handle into the checkpointer constructor in this unit test.
  return {} as DrizzleClient;
};

test("registers the file-import graph used by uploaded project files", () => {
  const runtime = createDefaultGraphRuntime(
    createFakeDrizzle(),
    PluginManager.get("GLOBAL", ""),
  );

  expect(runtime.graphRegistry.has("upsert-content-node-from-file")).toBe(true);
});
