import { Hono } from "hono";
import { stream } from "hono/streaming";
import { getDrizzleDB, getRedisDB } from "@cat/db";
import { PluginRegistry, type StorageProvider } from "@cat/plugin-core";
import {
  FileDownloadPayloadSchema,
  getServiceFromDBId,
  PresignedPutFileSessionPayloadSchema,
} from "@cat/app-server-shared/utils";
import { Readable } from "node:stream";
import { logger } from "@cat/shared/utils";

const app = new Hono();

app.put("/upload/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");
  const { redis } = await getRedisDB();
  const drizzle = await getDrizzleDB();
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const redisKey = `file:client:put:${sessionId}`;
  const { key, storageProviderId } = PresignedPutFileSessionPayloadSchema.parse(
    await redis.hGetAll(redisKey),
  );

  const provider = await getServiceFromDBId<StorageProvider>(
    drizzle.client,
    pluginRegistry,
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
    logger.error("SERVER", { msg: `Upload file ${key} error` }, e);
    return c.text("Upload failed", 500);
  }
});

app.get("/download/:token", async (c) => {
  const token = c.req.param("token");
  const { redis } = await getRedisDB();
  const drizzle = await getDrizzleDB();
  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  const redisKey = `file:download:${token}`;

  const { key, storageProviderId, filename } = FileDownloadPayloadSchema.parse(
    await redis.hGetAll(redisKey),
  );

  const provider = await getServiceFromDBId<StorageProvider>(
    drizzle.client,
    pluginRegistry,
    storageProviderId,
  );

  try {
    const fileStream = await provider.getStream({ key });
    c.header("Content-Disposition", `attachment; filename="${filename}"`);

    return stream(c, async (stream) => {
      await stream.pipe(Readable.toWeb(fileStream));
    });
  } catch (e) {
    logger.error("SERVER", { msg: `Download file ${key} error` }, e);
    return c.text("File not found", 404);
  }
});

export default app;
