import { BuiltinPluginLoader } from "@cat/plugin-core";
import {
  defaultProductPluginIds,
  systemPgVectorEntry,
} from "@cat/server-shared";
import { describe, expect, it } from "vitest";

import { builtinDefaultPluginEntries, defaultPluginIds } from "./catalog";

describe("default plugin catalog", () => {
  it("matches the shared product defaults and excludes pgvector-storage", () => {
    expect(defaultPluginIds).toEqual([...defaultProductPluginIds]);
    expect(defaultPluginIds).toContain(systemPgVectorEntry.manifest.id);
    expect(defaultPluginIds).not.toContain("pgvector-storage");
  });

  it("provides builtin entries for every default plugin id", async () => {
    const loader = new BuiltinPluginLoader(builtinDefaultPluginEntries);
    const entryIds = builtinDefaultPluginEntries.map(
      (entry) => entry.manifest.id,
    );

    expect(entryIds).toEqual(defaultPluginIds);

    for (const pluginId of defaultPluginIds) {
      // oxlint-disable-next-line no-await-in-loop -- manifest reads are intentionally sequential for clearer failures
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
