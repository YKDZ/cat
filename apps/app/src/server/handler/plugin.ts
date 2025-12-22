import { Hono } from "hono";
import { createReadStream } from "node:fs";
import { stream } from "hono/streaming";
import { Readable } from "node:stream";
import { logger } from "@cat/shared/utils";
import { resolvePluginComponentPath } from "@cat/app-server-shared/utils";

const app = new Hono();

app.get("/:pluginId/component/:componentName", async (c) => {
  const pluginId = c.req.param("pluginId");
  const componentName = c.req.param("componentName");

  try {
    c.header("Content-Type", "application/javascript; charset=utf-8");
    c.header("Cache-Control", "no-store");
    return stream(
      c,
      async (s) => {
        const stream = Readable.toWeb(
          // @ts-expect-error no needed
          // oxlint-disable-next-line no-unsafe-type-assertion
          createReadStream(
            resolvePluginComponentPath(pluginId, componentName),
            "utf8",
          ) as ReadableStream,
        );
        // @ts-expect-error no needed
        await s.pipe(stream);
      },
      async (err) => {
        logger.error(
          "SERVER",
          { msg: "Error streaming plugin component" },
          err,
        );
      },
    );
  } catch {
    return c.text("module not found", 404);
  }
});

export const pluginHandler = app;
