import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { getRuntimeCapabilities } from "@cat/app-api/context";
import { resolvePluginComponentPath } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import { Hono, type Context } from "hono";
import { stream } from "hono/streaming";

const app = new Hono();

const runtimePluginManager = ():
  | ReturnType<typeof getRuntimeCapabilities>["pluginManager"]
  | null => {
  try {
    return getRuntimeCapabilities().pluginManager;
  } catch {
    return null;
  }
};

const proxyPluginRequest = async (c: Context): Promise<Response> => {
  const pluginManager = runtimePluginManager();
  if (pluginManager === null) return c.text("Server is starting...", 503);

  const params = c.req.param();
  const pluginId = params["pluginId"] ?? c.req.path.split("/")[3];
  if (pluginId === undefined || pluginId === "") return c.notFound();

  const requestedAsset = new URL(c.req.url).searchParams.get("path");
  if (requestedAsset !== null) {
    const asset = await pluginManager
      .getLoader()
      .resolveAssetPath?.(pluginId, requestedAsset);
    if (asset === null || asset === undefined) return c.notFound();
    return new Response(await readFile(asset), {
      headers: { "content-type": "text/javascript; charset=utf-8" },
    });
  }

  const pluginApp = pluginManager.getRouteRegistry().resolve(pluginId);
  if (!pluginApp) return c.notFound();
  return pluginApp.fetch(c.req.raw);
};

app.get("/:pluginId/component/:componentName", async (c) => {
  // TODO 客户端传参
  const { pluginManager } = getRuntimeCapabilities();
  const pluginId = c.req.param("pluginId");
  const componentName = c.req.param("componentName");

  try {
    const filePath = await resolvePluginComponentPath(
      pluginManager,
      pluginId,
      componentName,
    );

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
        const fileStream = Readable.toWeb(createReadStream(filePath));
        // oxlint-disable-next-line no-unsafe-type-assertion
        await s.pipe(fileStream as unknown as ReadableStream);
      },
      async (err) => {
        logger
          .child({ component: "server" })
          .error("Error streaming plugin component", {
            ...{
              pluginId,
              componentName,
            },
            error: err,
          });
      },
    );
  } catch (error) {
    logger.child({ component: "server" }).error("Plugin component not found", {
      ...{ pluginId, componentName },
      error: error,
    });
    return c.text("module not found", 404);
  }
});

app.all("/:scopeType/:scopeId/:pluginId/*", proxyPluginRequest);
app.all("/GLOBAL//:pluginId/*", proxyPluginRequest);
app.all("/:scopeType/*", proxyPluginRequest);

export default app;
