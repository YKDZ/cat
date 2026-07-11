import { describe, expect, it } from "vitest";

import {
  defaultFilesystemPluginIds,
  defaultProductPluginIds,
  defaultSystemPluginIds,
} from "./plugin-defaults.ts";
import { systemPgVectorEntry } from "./vector/index.ts";

describe("plugin defaults", () => {
  it("combines filesystem and system defaults without the legacy pgvector plugin", () => {
    expect(defaultProductPluginIds).toEqual([
      ...defaultFilesystemPluginIds,
      ...defaultSystemPluginIds,
    ]);
    expect(defaultProductPluginIds).toContain(systemPgVectorEntry.manifest.id);
    expect(defaultProductPluginIds).not.toContain("pgvector-storage");
  });
});
