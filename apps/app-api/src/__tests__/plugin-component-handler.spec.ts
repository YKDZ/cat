import type { CatPlugin, ComponentRecord } from "@cat/plugin-core";

import { BuiltinPluginLoader, PluginManager } from "@cat/plugin-core";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import app from "@/handler/plugin";

const PLUGIN_ID = "tiny-widget";
const COMPONENT_NAME = "daily-quote-widget";

let tempDir: string | undefined;

const plugin = {
  components: vi.fn().mockResolvedValue([]),
} satisfies CatPlugin;

const createManager = async (componentUrl: string): Promise<PluginManager> => {
  tempDir = await mkdtemp(join(tmpdir(), "plugin-component-handler-"));
  await mkdir(join(tempDir, "dist"), { recursive: true });
  await writeFile(
    join(tempDir, "dist", "daily-quote-widget.js"),
    "export default 'widget';\n",
    "utf8",
  );

  const loader = new BuiltinPluginLoader([
    {
      manifest: {
        id: PLUGIN_ID,
        version: "1.0.0",
        entry: "builtin:tiny-widget",
        services: [],
      },
      data: {
        id: PLUGIN_ID,
        name: "Tiny Widget",
        version: "1.0.0",
        overview: "builtin tiny widget",
        entry: "builtin:tiny-widget",
      },
      load: () => plugin,
      assetRoot: tempDir,
    },
  ]);
  const manager = PluginManager.get("GLOBAL", "", loader);
  const components = [
    {
      pluginId: PLUGIN_ID,
      name: COMPONENT_NAME,
      slot: "test",
      url: componentUrl,
    },
  ] satisfies ComponentRecord[];

  vi.spyOn(manager, "getComponents").mockReturnValue(components);
  return manager;
};

afterEach(async () => {
  PluginManager.clear();
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("plugin component handler", () => {
  it("serves builtin component modules from loader-resolved asset roots", async () => {
    await createManager("dist/daily-quote-widget.js");

    const response = await app.request(
      `http://localhost/${PLUGIN_ID}/component/${COMPONENT_NAME}`,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/javascript",
    );
    await expect(response.text()).resolves.toContain("widget");
  });

  it("rejects component paths that escape the plugin root", async () => {
    await createManager("../escape.js");

    const response = await app.request(
      `http://localhost/${PLUGIN_ID}/component/${COMPONENT_NAME}`,
    );

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toContain("module not found");
  });
});
