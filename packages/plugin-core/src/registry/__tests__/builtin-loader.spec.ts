import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { CatPlugin } from "@/entities/plugin";

import { BuiltinPluginLoader } from "@/registry/builtin-loader";
import { CompositePluginLoader } from "@/registry/composite-loader";
import { FileSystemPluginLoader, type PluginLoader } from "@/registry/loader";

const plugin = {
  services: vi.fn().mockResolvedValue([]),
} satisfies CatPlugin;

const manifest = {
  id: "builtin-plugin",
  version: "1.0.0",
  entry: "builtin:index.js",
  services: [],
};

const data = {
  id: "builtin-plugin",
  name: "Builtin Plugin",
  version: "1.0.0",
  overview: "builtin overview",
  entry: "builtin:index.js",
};

const extraManifest = {
  id: "extra-plugin",
  version: "1.0.0",
  entry: "builtin:extra.js",
  services: [],
};

const extraData = {
  id: "extra-plugin",
  name: "Extra Plugin",
  version: "1.0.0",
  overview: "extra overview",
  entry: "builtin:extra.js",
};

const makeLoader = (manifests: Array<typeof manifest>): PluginLoader => ({
  getManifest: vi.fn(async (pluginId: string) => {
    const found = manifests.find((item) => item.id === pluginId);
    if (!found) {
      throw new Error(`missing ${pluginId}`);
    }
    return found;
  }),
  getData: vi.fn(async (pluginId: string) => {
    if (pluginId === data.id) return data;
    if (pluginId === extraData.id) return extraData;
    throw new Error(`missing ${pluginId}`);
  }),
  getInstance: vi.fn(async (pluginId: string) => {
    if (pluginId === data.id || pluginId === extraData.id) return plugin;
    throw new Error(`missing ${pluginId}`);
  }),
  listAvailablePlugins: vi.fn().mockResolvedValue(manifests),
  resolveAssetPath: vi.fn().mockResolvedValue(null),
});

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("BuiltinPluginLoader", () => {
  it("returns manifest/data/instance and resolves safe asset paths", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "builtin-loader-"));
    await mkdir(join(tempDir, "dist"), { recursive: true });
    await writeFile(join(tempDir, "dist", "widget.js"), "export default 1;\n");

    const loader = new BuiltinPluginLoader([
      {
        manifest,
        data,
        load: () => plugin,
        assetRoot: tempDir,
      },
    ]);

    await expect(loader.getManifest("builtin-plugin")).resolves.toEqual(
      manifest,
    );
    await expect(loader.getData("builtin-plugin")).resolves.toEqual(data);
    await expect(loader.getInstance("builtin-plugin")).resolves.toBe(plugin);
    await expect(
      loader.resolveAssetPath("builtin-plugin", "dist/widget.js"),
    ).resolves.toBe(join(tempDir, "dist", "widget.js"));
    await expect(
      loader.resolveAssetPath("builtin-plugin", "../escape.js"),
    ).resolves.toBeNull();
  });
});

describe("CompositePluginLoader", () => {
  it("prefers the first matching loader and deduplicates plugin listings", async () => {
    const first = makeLoader([manifest]);
    const second = makeLoader([manifest, extraManifest]);
    const loader = new CompositePluginLoader([first, second]);

    await expect(loader.getManifest("builtin-plugin")).resolves.toEqual(
      manifest,
    );
    await expect(loader.getData("builtin-plugin")).resolves.toEqual(data);
    await expect(loader.getInstance("builtin-plugin")).resolves.toBe(plugin);
    await expect(loader.listAvailablePlugins()).resolves.toEqual([
      manifest,
      extraManifest,
    ]);
    expect(first.getManifest).toHaveBeenCalledWith("builtin-plugin");
    expect(second.getManifest).not.toHaveBeenCalledWith("builtin-plugin");
  });
});

describe("FileSystemPluginLoader.resolveAssetPath", () => {
  it("rejects path traversal outside the plugin root", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "fs-loader-"));
    await mkdir(join(tempDir, "plugin-a", "dist"), { recursive: true });

    const loader = new FileSystemPluginLoader(tempDir);

    await expect(
      loader.resolveAssetPath?.("plugin-a", "dist/index.js"),
    ).resolves.toBe(join(tempDir, "plugin-a", "dist", "index.js"));
    await expect(
      loader.resolveAssetPath?.("plugin-a", "../escape.js"),
    ).resolves.toBeNull();
  });
});
