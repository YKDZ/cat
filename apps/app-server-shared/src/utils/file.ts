import type { PluginRegistry, StorageProvider } from "@cat/plugin-core";
import {
  and,
  blob as blobTable,
  decrement,
  DrizzleClient,
  eq,
  file as fileTable,
  gt,
  increment,
  RedisClientType,
} from "@cat/db";
import { assertSingleNonNullish, logger } from "@cat/shared/utils";
import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import * as z from "zod";
import { getServiceFromDBId } from "./plugin";
import { hashFromReadable } from "./stream";

export const PresignedPutFileSessionPayloadSchema = z.object({
  blobId: z.coerce.number().int(),
  fileId: z.coerce.number().int(),
  key: z.string(),
  storageProviderId: z.coerce.number().int(),
  ctxHash: z.string(),
});
export type PresignedPutFileSessionPayload = z.infer<
  typeof PresignedPutFileSessionPayloadSchema
>;

export const putBufferToStorage = async (
  drizzle: DrizzleClient,
  storageProvider: StorageProvider,
  storageProviderId: number,
  buffer: Buffer,
  key: string,
  name: string,
): Promise<{ fileId: number; blobId: number }> => {
  const hash = createHash("sha256").update(buffer).digest();

  const { blob, file } = await drizzle.transaction(async (tx) => {
    const blob = assertSingleNonNullish(
      await tx
        .insert(blobTable)
        .values({
          key,
          storageProviderId,
          hash: hash,
        })
        .onConflictDoUpdate({
          target: [blobTable.hash],
          set: {
            referenceCount: increment(blobTable.referenceCount),
          },
        })
        .returning({
          id: blobTable.id,
          referenceCount: blobTable.referenceCount,
        }),
    );

    const file = assertSingleNonNullish(
      await tx
        .insert(fileTable)
        .values({
          name,
          blobId: blob.id,
          isActive: false,
        })
        .returning({ id: fileTable.id }),
    );

    return { file, blob };
  });

  if (blob.referenceCount === 1)
    try {
      await storageProvider.putStream({ key, stream: Readable.from(buffer) });
      await drizzle
        .update(fileTable)
        .set({ isActive: true })
        .where(eq(fileTable.id, file.id));
    } catch (error) {
      await drizzle.transaction(async (tx) => {
        await tx
          .update(blobTable)
          .set({ referenceCount: decrement(blobTable.referenceCount) })
          .where(
            and(eq(blobTable.id, blob.id), gt(blobTable.referenceCount, 0)),
          );
        await tx.delete(fileTable).where(eq(fileTable.id, file.id));
      });

      logger.error("PROCESSOR", { msg: "Error putting file" }, error);
      throw error;
    }

  return { fileId: file.id, blobId: blob.id };
};

export const preparePresignedPutFile = async (
  drizzle: DrizzleClient,
  redis: RedisClientType,
  storage: StorageProvider,
  storageId: number,
  key: string,
  name: string,
  ctxHash: string = "",
  expiresInSeconds: number = 120,
): Promise<{ url: string; putSessionId: string; fileId: number }> => {
  const { blobId, fileId } = await drizzle.transaction(async (tx) => {
    const blob = assertSingleNonNullish(
      await tx
        .insert(blobTable)
        .values({
          key,
          storageProviderId: storageId,
        })
        .returning({ id: blobTable.id }),
    );

    const file = assertSingleNonNullish(
      await tx
        .insert(fileTable)
        .values({
          name,
          blobId: blob.id,
          isActive: false,
        })
        .returning({ id: fileTable.id }),
    );

    return { blobId: blob.id, fileId: file.id };
  });

  const putSessionId = randomUUID();
  const redisKey = `file:client:put:${putSessionId}`;

  await redis.hSet(redisKey, {
    blobId,
    fileId,
    key,
    storageProviderId: storageId,
    ctxHash,
  } satisfies PresignedPutFileSessionPayload);
  await redis.expire(redisKey, expiresInSeconds);

  let url: string;
  if (storage.shouldProxy()) {
    url = `/api/storage/upload/${putSessionId}`;
  } else {
    url = await storage.getPresignedPutUrl({
      key,
      expiresIn: expiresInSeconds,
    });
  }

  return {
    url,
    putSessionId,
    fileId,
  };
};

export const FileDownloadPayloadSchema = z.object({
  key: z.string(),
  storageProviderId: z.coerce.number().int(),
  filename: z.string(),
});
export type FileDownloadPayload = z.infer<typeof FileDownloadPayloadSchema>;

export const getDownloadUrl = async (
  redis: RedisClientType,
  storageProvider: StorageProvider,
  storageProviderId: number,
  key: string,
  expiresInSeconds: number = 120,
  filename?: string,
): Promise<string> => {
  if (storageProvider.shouldProxy()) {
    const token = randomUUID();
    const redisKey = `file:download:${token}`;

    await redis.hSet(redisKey, {
      key,
      storageProviderId,
      filename: filename ?? "",
    } satisfies FileDownloadPayload);
    await redis.expire(redisKey, expiresInSeconds);

    return `/api/storage/download/${token}`;
  }

  return await storageProvider.getPresignedGetUrl({
    key,
    expiresIn: expiresInSeconds,
    fileName: filename,
  });
};

export const finishPresignedPutFile = async (
  drizzle: DrizzleClient,
  redis: RedisClientType,
  pluginRegistry: PluginRegistry,
  putSessionId: string,
  ctxHash: string = "",
): Promise<number> => {
  const redisKey = `file:client:put:${putSessionId}`;
  const {
    blobId,
    fileId,
    key,
    storageProviderId,
    ctxHash: storedCtxHash,
  } = PresignedPutFileSessionPayloadSchema.parse(await redis.hGetAll(redisKey));

  await redis.del(redisKey);

  const storageProvider = await getServiceFromDBId<StorageProvider>(
    drizzle,
    pluginRegistry,
    storageProviderId,
  );

  if (storedCtxHash !== ctxHash) {
    await storageProvider.delete({ key });
    await drizzle.transaction(async (tx) => {
      await tx.delete(blobTable).where(eq(blobTable.id, blobId));
      await tx.delete(fileTable).where(eq(fileTable.id, fileId));
    });
  }

  await storageProvider.head({ key });

  const hash = await hashFromReadable(await storageProvider.getStream({ key }));

  // 查找是否有哈希相同的 blob，如果有则删除原 blob 并将 file 关联到这个 blob
  // 否则将 hash 更新到源 blob 上

  const conflicted = await drizzle.transaction(async (tx) => {
    const conflictBlobRows = await tx
      .select({ conflictBlobId: blobTable.id })
      .from(blobTable)
      .where(eq(blobTable.hash, hash));
    if (conflictBlobRows.length > 0) {
      await tx
        .update(fileTable)
        .set({ blobId: conflictBlobRows[0].conflictBlobId })
        .where(eq(fileTable.id, fileId));
      await tx
        .update(blobTable)
        .set({ referenceCount: increment(blobTable.referenceCount) })
        .where(eq(blobTable.id, conflictBlobRows[0].conflictBlobId));
      await tx.delete(blobTable).where(eq(blobTable.id, blobId));
    } else {
      await tx.update(blobTable).set({ hash }).where(eq(blobTable.id, blobId));
    }

    await tx
      .update(fileTable)
      .set({ isActive: true })
      .where(eq(fileTable.id, fileId));

    return conflictBlobRows.length > 0;
  });

  if (conflicted) await storageProvider.delete({ key });

  return fileId;
};
