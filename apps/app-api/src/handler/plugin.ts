import { Hono } from "hono";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { stream } from "hono/streaming";
import { Readable } from "node:stream";
import { logger } from "@cat/shared/utils";
import { resolvePluginComponentPath } from "@cat/app-server-shared/utils";

const app = new Hono();

app.get("/:pluginId/component/:componentName", async (c) => {
  const pluginId = c.req.param("pluginId");
  const componentName = c.req.param("componentName");

  try {
    const filePath = resolvePluginComponentPath(pluginId, componentName);

    const fileStat = await stat(filePath);

    const etag = `W/"${fileStat.size.toString(16)}-${fileStat.mtimeMs.toString(16)}"`;
    const lastModified = fileStat.mtime.toUTCString();

    const ifNoneMatch = c.req.header("if-none-match");
    const ifModifiedSince = c.req.header("if-modified-since");

    if (ifNoneMatch === etag || ifModifiedSince === lastModified) {
      return c.body(null, 304);
    }

    c.header("Cache-Control", "no-cache");
    c.header("ETag", etag);
    c.header("Last-Modified", lastModified);
    c.header("Content-Type", "application/javascript; charset=utf-8");

    return stream(
      c,
      async (s) => {
        const fileStream = Readable.toWeb(createReadStream(filePath, "utf8"));
        // oxlint-disable-next-line no-unsafe-type-assertion
        await s.pipe(fileStream as unknown as ReadableStream);
      },
      async (err) => {
        logger.error(
          "SERVER",
          { msg: "Error streaming plugin component", pluginId, componentName },
          err,
        );
      },
    );
  } catch (error) {
    logger.error(
      "SERVER",
      { msg: "Plugin component not found", path: pluginId },
      error,
    );
    return c.text("module not found", 404);
  }
});

export default app;
