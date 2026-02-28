import {
  FileDownloadPayloadSchema,
  getServiceFromDBId,
  PresignedPutFileSessionPayloadSchema,
} from "@cat/app-server-shared/utils";
import { getRedisDB } from "@cat/db";
import { PluginManager, type StorageProvider } from "@cat/plugin-core";
import { logger } from "@cat/shared/utils";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { Readable } from "node:stream";

const app = new Hono();

app.put("/upload/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { redis } = await getRedisDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const redisKey = `file:client:put:${sessionId}`;
  const { key, storageProviderId } = PresignedPutFileSessionPayloadSchema.parse(
    await redis.hGetAll(redisKey),
  );

  const provider = getServiceFromDBId<StorageProvider>(
    pluginManager,
    storageProviderId,
  );

  const bodyStream = c.req.raw.body;
  if (!bodyStream) {
    return c.text("No body", 400);
  }

  try {
    const nodeStream = Readable.fromWeb(bodyStream);
    await provider.putStream({ key, stream: nodeStream });

    return c.text("OK");
  } catch (e) {
    logger.error(
      "SERVER",
      {
        msg: "Upload file error",
        operation: "upload",
        errorType: e instanceof Error ? e.constructor.name : "Unknown",
      },
      e,
    );
    return c.text("Upload failed", 500);
  }
});

app.get("/download/:token", async (c) => {
  const token = c.req.param("token");
  const { redis } = await getRedisDB();
  const pluginManager = PluginManager.get("GLOBAL", "");

  const redisKey = `file:download:${token}`;

  const { key, storageProviderId, filename } = FileDownloadPayloadSchema.parse(
    await redis.hGetAll(redisKey),
  );

  const provider = getServiceFromDBId<StorageProvider>(
    pluginManager,
    storageProviderId,
  );

  try {
    // Parse Range header
    const rangeHeader = c.req.header("range");

    if (rangeHeader) {
      const matches = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (matches) {
        const start = parseInt(matches[1], 10);
        const end = matches[2] ? parseInt(matches[2], 10) : undefined;
        const requestedEnd = end || start + 1024 * 1024;

        const result = await provider.getRange({
          key,
          start,
          end: requestedEnd,
        });

        c.header(
          "Content-Range",
          `bytes ${start}-${requestedEnd}/${result.total}`,
        );

        const contentLength = new TextEncoder().encode(result.data).length;
        c.header("Content-Length", contentLength.toString());

        const nextStart = result.actualEnd + 1;
        c.header("Next-Range", nextStart.toString());

        c.header("Accept-Ranges", "bytes");
        c.header("Content-Type", "application/octet-stream");

        return c.text(result.data, 206);
      }
    }

    // 返回完整文件
    const fileStream = await provider.getStream({ key });
    c.header("Content-Disposition", `attachment; filename="${filename}"`);
    c.header("Accept-Ranges", "bytes");

    return stream(c, async (stream) => {
      await stream.pipe(Readable.toWeb(fileStream));
    });
  } catch (e) {
    logger.error(
      "SERVER",
      {
        msg: "Download file error",
        operation: "download",
        errorType: e instanceof Error ? e.constructor.name : "Unknown",
      },
      e,
    );
    return c.text("File not found", 404);
  }
});

export default app;
