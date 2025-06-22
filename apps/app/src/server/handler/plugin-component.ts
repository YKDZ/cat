import type { PluginRegistry } from "@cat/plugin-core";
import { logger } from "@cat/shared";
import { Hono } from "hono";
import { readFile } from "node:fs/promises";

type Variables = {
  pluginRegistry: PluginRegistry;
};

const app = new Hono<{ Variables: Variables }>();

app.get("/:pluginId/:componentId", async (c) => {
  try {
    const { pluginId, componentId } = c.req.param();

    const componentModuleBuffer = await readFile(
      await c.var.pluginRegistry.getPluginComponentFsPath(
        pluginId,
        componentId,
      ),
    );

    c.header("Content-Type", "application/javascript");
    c.header("Content-Disposition", `inline; filename="${componentId}.mjs"`);
    // c.header("Cache-Control", "public, max-age=3600");

    return c.body(componentModuleBuffer);
  } catch (e) {
    logger.error(
      "PLUGIN",
      "Error when client request plugin component module",
      e,
    );
    return c.status(404);
  }
});

export const pluginComponentHandler = app;
