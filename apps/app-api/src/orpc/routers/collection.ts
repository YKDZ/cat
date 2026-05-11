import {
  finishPresignedPutFile,
  firstOrGivenService,
  preparePresignedPutFile,
} from "@cat/server-shared";
import { sanitizeFileName, StructuredContentPayloadSchema } from "@cat/shared";
import { runGraph, ingestCollectionGraph } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

/**
 * @zh 采集入库：接受 CollectionPayload，执行完整入库流程。
 * @en Ingest collection: accept CollectionPayload, run full ingestion pipeline.
 */
export const ingest = authed
  .input(StructuredContentPayloadSchema)
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(
    z.object({
      contentNodeIds: z.array(z.uuidv4()),
      addedCount: z.int(),
      removedCount: z.int(),
      updatedCount: z.int(),
      movedCount: z.int(),
      semanticDiffIds: z.array(z.int()),
    }),
  )
  .handler(async ({ context, input }) => {
    const { pluginManager } = context;

    const vectorStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!vectorStorage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No vectorizer or vector storage provider available",
      });
    }

    const result = await runGraph(ingestCollectionGraph, {
      payload: input,
      vectorizerId: vectorizer.id,
      vectorStorageId: vectorStorage.id,
    });

    return result;
  });

/**
 * @zh 获取 presigned URL 用于上传文件类上下文（截图等）。
 * @en Get presigned URL for uploading file-based contexts (screenshots, etc.).
 */
export const prepareUpload = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      fileName: z.string(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(
    z.object({
      url: z.string(),
      fileId: z.int(),
      putSessionId: z.uuidv4(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;

    const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");
    if (!storage) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider found",
      });
    }

    const name = sanitizeFileName(input.fileName);
    const key = join("collection-uploads", randomUUID() + name);

    const { url, putSessionId, fileId } = await preparePresignedPutFile(
      drizzle,
      sessionStore,
      storage.service,
      storage.id,
      key,
      name,
    );

    return { url, putSessionId, fileId };
  });

/**
 * @zh 完成 presigned 上传：校验会话、计算哈希、去重、激活文件。
 * @en Finish presigned upload: validate session, compute hash, deduplicate, activate file.
 */
export const finishUpload = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      putSessionId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.object({ fileId: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;

    const fileId = await finishPresignedPutFile(
      drizzle,
      sessionStore,
      pluginManager,
      input.putSessionId,
    );

    return { fileId };
  });
