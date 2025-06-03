import { PluginRegistry } from "@cat/plugin-core";
import { logger } from "@cat/shared";
import { readFile } from "fs/promises";
import { Hono } from "hono";
import { join } from "path";

const app = new Hono();

app.get("/:pluginId/:componentFile", async (c) => {
  const { pluginId, componentFile } = c.req.param();

  // 获取插件文件系统路径并拼接组件文件路径
  const fsPath = PluginRegistry.getPlugiFsPath(pluginId);
  const fullPath = join(fsPath, componentFile.replace("@@@", "/"));

  try {
    const data = await readFile(fullPath);

    // 尝试推断 MIME 类型（这里只做简单处理，可根据需要引入 mime-types 包）
    const contentType =
      getContentType(componentFile) || "application/octet-stream";

    return new Response(data, {
      status: 200,
      headers: {
        "Content-Type": contentType,
      },
    });
  } catch (err) {
    logger.error("PLUGIN", "Error reading plugin component file:", err);
    return c.notFound();
  }
});

function getContentType(fileName: string): string | undefined {
  if (fileName.endsWith(".js")) return "application/javascript";
  if (fileName.endsWith(".ts")) return "application/typescript";
  if (fileName.endsWith(".json")) return "application/json";
  if (fileName.endsWith(".css")) return "text/css";
  if (fileName.endsWith(".html")) return "text/html";
  if (fileName.endsWith(".vue")) return "text/plain";
  return undefined;
}

export const internalPluginComponentsHandler = app;
