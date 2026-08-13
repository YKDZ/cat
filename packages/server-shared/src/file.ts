import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import {
  activateFile,
  createBlobAndFile,
  createOrReferenceBlobAndFile,
  deleteBlobAndFile,
  executeCommand,
  finalizePresignedFile,
  rollbackBlobAndFile,
  type DbHandle,
  type SessionStore,
} from "@cat/domain";
import type { PluginManager, StorageProvider } from "@cat/plugin-core";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import * as z from "zod";

import { resolveServiceImplementation } from "./plugin.ts";
import { hashFromReadable } from "./stream.ts";
import { serverLogger } from "./utils/logger.ts";

const SessionServiceImplementationReferenceSchema = z
  .string()
  .transform((value) => JSON.parse(value))
  .pipe(ServiceImplementationReferenceSchema);

export const PresignedPutFileSessionPayloadSchema = z.object({
  blobId: z.coerce.number().int(),
  fileId: z.coerce.number().int(),
  key: z.string(),
  storageProvider: SessionServiceImplementationReferenceSchema,
  ctxHash: z.string(),
});
export type PresignedPutFileSessionPayload = z.infer<
  typeof PresignedPutFileSessionPayloadSchema
>;

export const putBufferToStorage = async (
  drizzle: DbHandle,
  storageProvider: StorageProvider,
  storageProviderReference: import("@cat/shared").ServiceImplementationReference,
  buffer: Buffer,
  key: string,
  name: string,
): Promise<{ fileId: number; blobId: number }> => {
  const hash = createHash("sha256").update(buffer).digest();

  const { blobId, fileId, referenceCount } = await drizzle.transaction(
    async (tx) => {
      return await executeCommand({ db: tx }, createOrReferenceBlobAndFile, {
        key,
        storageProvider: storageProviderReference,
        name,
        hash,
      });
    },
  );

  if (referenceCount === 1)
    try {
      await storageProvider.putStream({ key, stream: Readable.from(buffer) });
      await executeCommand({ db: drizzle }, activateFile, { fileId });
    } catch (error) {
      await drizzle.transaction(async (tx) => {
        await executeCommand({ db: tx }, rollbackBlobAndFile, {
          blobId,
          fileId,
        });
      });

      serverLogger
        .child({ component: "worker" })
        .error("Error putting file", { error: error });
      throw error;
    }

  return { fileId, blobId };
};

export const preparePresignedPutFile = async (
  drizzle: DbHandle,
  sessionStore: SessionStore,
  storage: StorageProvider,
  storageProviderReference: import("@cat/shared").ServiceImplementationReference,
  key: string,
  name: string,
  ctxHash: string = "",
  expiresInSeconds: number = 120,
): Promise<{ url: string; putSessionId: string; fileId: number }> => {
  const { blobId, fileId } = await drizzle.transaction(async (tx) => {
    return await executeCommand({ db: tx }, createBlobAndFile, {
      key,
      storageProvider: storageProviderReference,
      name,
    });
  });

  const putSessionId = randomUUID();
  const redisKey = `file:client:put:${putSessionId}`;

  await sessionStore.create(
    redisKey,
    {
      blobId,
      fileId,
      key,
      storageProvider: JSON.stringify(storageProviderReference),
      ctxHash,
    },
    expiresInSeconds,
  );

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
  storageProvider: SessionServiceImplementationReferenceSchema,
  filename: z.string(),
});
export type FileDownloadPayload = z.infer<typeof FileDownloadPayloadSchema>;

export const getDownloadUrl = async (
  sessionStore: SessionStore,
  storageProvider: StorageProvider,
  storageProviderReference: import("@cat/shared").ServiceImplementationReference,
  key: string,
  expiresInSeconds: number = 120,
  filename?: string,
): Promise<string> => {
  if (storageProvider.shouldProxy()) {
    const token = randomUUID();
    const redisKey = `file:download:${token}`;

    await sessionStore.create(
      redisKey,
      {
        key,
        storageProvider: JSON.stringify(storageProviderReference),
        filename: filename ?? "",
      },
      expiresInSeconds,
    );

    return `/api/storage/download/${token}`;
  }

  return await storageProvider.getPresignedGetUrl({
    key,
    expiresIn: expiresInSeconds,
    ...(filename === undefined ? {} : { fileName: filename }),
  });
};

export const finishPresignedPutFile = async (
  drizzle: DbHandle,
  sessionStore: SessionStore,
  pluginManager: PluginManager,
  putSessionId: string,
  ctxHash: string = "",
): Promise<number> => {
  const redisKey = `file:client:put:${putSessionId}`;
  const {
    blobId,
    fileId,
    key,
    storageProvider,
    ctxHash: storedCtxHash,
  } = PresignedPutFileSessionPayloadSchema.parse(
    await sessionStore.getAll(redisKey),
  );

  await sessionStore.destroy(redisKey);

  const storage = resolveServiceImplementation(
    pluginManager,
    storageProvider,
    "STORAGE_PROVIDER",
  );

  if (storedCtxHash !== ctxHash) {
    await storage.delete({ key });
    await drizzle.transaction(async (tx) => {
      await executeCommand({ db: tx }, deleteBlobAndFile, {
        blobId,
        fileId,
      });
    });
  }

  await storage.head({ key });

  const hash = await hashFromReadable(await storage.getStream({ key }));

  // 查找是否有哈希相同的 blob，如果有则删除原 blob 并将 file 关联到这个 blob
  // 否则将 hash 更新到源 blob 上

  const { conflicted } = await drizzle.transaction(async (tx) => {
    return await executeCommand({ db: tx }, finalizePresignedFile, {
      blobId,
      fileId,
      hash,
    });
  });

  if (conflicted) await storage.delete({ key });

  return fileId;
};
