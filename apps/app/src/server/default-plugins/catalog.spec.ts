import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BuiltinPluginLoader } from "@cat/plugin-core";
import {
  defaultProductPluginIds,
  systemPgVectorEntry,
} from "@cat/server-shared";
import { Logger } from "@cat/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  builtinDefaultPluginEntries,
  createAppPluginLoader,
  defaultPluginIds,
} from "./catalog.ts";

let workingDirectory: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (workingDirectory !== undefined) {
    await rm(workingDirectory, { force: true, recursive: true });
    workingDirectory = undefined;
  }
});

describe("default plugin catalog", () => {
  it("matches the shared product defaults", () => {
    expect(defaultPluginIds).toEqual([...defaultProductPluginIds]);
    expect(defaultPluginIds).toContain(systemPgVectorEntry.manifest.id);
  });

  it("provides builtin entries for every default plugin id", async () => {
    const loader = new BuiltinPluginLoader(builtinDefaultPluginEntries);
    const entryIds = builtinDefaultPluginEntries.map(
      (entry) => entry.manifest.id,
    );

    expect(entryIds).toEqual(defaultPluginIds);

    for (const pluginId of defaultPluginIds) {
      // oxlint-disable-next-line no-await-in-loop -- Sequential reads make an absent builtin explicit.
      const manifest = await loader.getManifest(pluginId);
      expect(manifest.id).toBe(pluginId);
    }
  });

  it("registers the builtin system pgvector entry alongside filesystem defaults", () => {
    expect(builtinDefaultPluginEntries).toContain(systemPgVectorEntry);
    expect(systemPgVectorEntry.manifest.services).toEqual([
      {
        id: "native-pgvector",
        type: "VECTOR_STORAGE",
        dynamic: false,
      },
    ]);
  });
});

describe("createAppPluginLoader", () => {
  it("routes filesystem plugin diagnostics through the host logger", async () => {
    workingDirectory = await mkdtemp(join(tmpdir(), "cat-app-plugin-loader-"));
    vi.spyOn(process, "cwd").mockReturnValue(workingDirectory);
    const diagnosticLogger = new Logger({ host: "app" });
    const observed = vi.fn();
    diagnosticLogger.observe(observed);
    const loader = createAppPluginLoader(diagnosticLogger);

    await expect(loader.getManifest("missing-user-plugin")).rejects.toThrow(
      "missing manifest.json",
    );

    expect(observed).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ component: "plugin", host: "app" }),
        level: "debug",
        message: "Plugin missing-user-plugin missing manifest.json",
      }),
    );
  });
});
