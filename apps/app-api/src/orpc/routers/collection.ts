import {
  executeCommand,
  executeQuery,
  findProjectDocumentByName,
  insertElementContexts,
  listElementIdsByDocument,
  listElementsForDiff,
} from "@cat/domain";
import {
  finishPresignedPutFile,
  firstOrGivenService,
  preparePresignedPutFile,
} from "@cat/server-shared";
import {
  CollectionContextDataSchema,
  CollectionPayloadSchema,
  type CollectionContextData,
} from "@cat/shared/schema/collection";
import { safeZDotJson } from "@cat/shared/schema/json";
import { sanitizeFileName } from "@cat/shared/utils";
import { runGraph, ingestCollectionGraph } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import * as z from "zod";

import { authed, checkPermission } from "@/orpc/server";

/**
 * @zh 采集入库：接受 CollectionPayload，执行完整入库流程。
 * @en Ingest collection: accept CollectionPayload, run full ingestion pipeline.
 */
export const ingest = authed
  .input(CollectionPayloadSchema)
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(
    z.object({
      documentId: z.uuidv4(),
      addedCount: z.int(),
      removedCount: z.int(),
      updatedCount: z.int(),
    }),
  )
  .handler(async ({ context, input }) => {
    const { pluginManager, user } = context;

    const vectorStorage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!vectorStorage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No vectorizer or vector storage provider available",
      });
    }

    // Resolve fileHandlerId string → DB id (if provided)
    let fileHandlerDbId: number | null = null;
    if (input.document.fileHandlerId) {
      const service = pluginManager
        .getServices("FILE_IMPORTER")
        .find(
          ({ service }) => service.getId() === input.document.fileHandlerId,
        );
      if (service) {
        fileHandlerDbId = service.dbId;
      }
    }

    const result = await runGraph(ingestCollectionGraph, {
      payload: input,
      userId: user.id,
      vectorizerId: vectorizer.id,
      vectorStorageId: vectorStorage.id,
      fileHandlerDbId,
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

/**
 * @zh 为已有元素补充上下文（增量添加）。
 * @en Add contexts to existing elements (incremental).
 */
export const addContexts = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      documentName: z.string(),
      contexts: z.array(
        z
          .object({
            elementMeta: safeZDotJson.optional(),
            elementId: z.int().optional(),
          })
          .and(CollectionContextDataSchema),
      ),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .output(z.object({ addedCount: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const doc = await executeQuery({ db: drizzle }, findProjectDocumentByName, {
      projectId: input.projectId,
      name: input.documentName,
      isDirectory: false,
    });

    if (!doc) {
      throw new ORPCError("NOT_FOUND", {
        message: `Document "${input.documentName}" not found in project`,
      });
    }

    const elementIds = await executeQuery(
      { db: drizzle },
      listElementIdsByDocument,
      { documentId: doc.id },
    );

    const elements = await executeQuery({ db: drizzle }, listElementsForDiff, {
      elementIds,
    });

    const contextInserts: {
      type: string;
      translatableElementId: number;
      textData?: string | null;
      jsonData?: unknown;
      fileId?: number | null;
    }[] = [];

    for (const ctx of input.contexts) {
      let elementId: number | undefined;

      if (ctx.elementId !== undefined) {
        const found = elements.find((e) => e.id === ctx.elementId);
        if (found) elementId = found.id;
      } else if (ctx.elementMeta !== undefined) {
        const found = elements.find((e) =>
          isDeepStrictEqual(e.meta, ctx.elementMeta),
        );
        if (found) elementId = found.id;
      }

      if (elementId === undefined) continue;

      const insert = buildContextInsert(ctx, elementId);
      if (insert) contextInserts.push(insert);
    }

    if (contextInserts.length > 0) {
      await executeCommand({ db: drizzle }, insertElementContexts, {
        data: contextInserts,
      });
    }

    return { addedCount: contextInserts.length };
  });

function buildContextInsert(ctx: CollectionContextData, elementId: number) {
  const base = { translatableElementId: elementId, type: ctx.type };
  switch (ctx.type) {
    case "TEXT":
      return { ...base, textData: ctx.data.text };
    case "JSON":
      return { ...base, jsonData: ctx.data.json };
    case "FILE":
      return { ...base, fileId: ctx.data.fileId };
    case "MARKDOWN":
      return { ...base, textData: ctx.data.markdown };
    case "URL":
      return { ...base, textData: ctx.data.url };
    case "IMAGE":
      return {
        ...base,
        fileId: ctx.data.fileId,
        jsonData: ctx.data.highlightRegion ?? null,
      };
    default:
      return null;
  }
}
