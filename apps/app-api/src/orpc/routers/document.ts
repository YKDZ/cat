import { runGraph, upsertDocumentGraph } from "@cat/agent/workflow";
import { createDocumentUnderParent } from "@cat/domain";
import {
  countDocumentElements,
  countDocumentTranslations,
  deleteDocument,
  executeCommand,
  executeQuery,
  findProjectDocumentByName,
  getActiveFileName,
  getDocumentBlobInfo,
  getDocument,
  getDocumentElementPageIndex,
  getDocumentElementTranslationStatus,
  getDocumentElements,
  getDocumentFileExportContext,
  getDocumentFirstElement,
  getProject,
} from "@cat/domain";
import { StorageProvider } from "@cat/plugin-core";
import {
  finishPresignedPutFile,
  getServiceFromDBId,
  preparePresignedPutFile,
  getDownloadUrl,
  firstOrGivenService,
} from "@cat/server-shared";
import {
  DocumentSchema,
  TranslatableElementSchema,
} from "@cat/shared/schema/drizzle/document";
import {
  ElementTranslationStatusSchema,
  FileMetaSchema,
} from "@cat/shared/schema/misc";
import { sanitizeFileName } from "@cat/shared/utils";
import { ORPCError } from "@orpc/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";

export const prepareCreateFromFile = authed
  .input(
    z.object({
      meta: FileMetaSchema,
    }),
  )
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
    const { meta } = input;

    // TODO 配置 storage
    const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");

    if (!storage)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `No storage provider found`,
      });

    const name = sanitizeFileName(meta.name);
    const key = join("documents", randomUUID() + name);

    const { url, putSessionId, fileId } = await preparePresignedPutFile(
      drizzle,
      sessionStore,
      storage.service,
      storage.id,
      key,
      name,
    );

    return {
      url,
      putSessionId,
      fileId,
    };
  });

export const finishCreateFromFile = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      languageId: z.string(),
      putSessionId: z.uuidv4(),
    }),
  )
  .handler(async ({ input, context }) => {
    const { projectId, putSessionId, languageId } = input;
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      user,
      pluginManager,
    } = context;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!storage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
    }

    const project = await executeQuery({ db: drizzle }, getProject, {
      projectId,
    });

    if (!project) {
      throw new ORPCError("NOT_FOUND", {
        message: `Project ${projectId} not found`,
      });
    }

    const fileId = await finishPresignedPutFile(
      drizzle,
      sessionStore,
      pluginManager,
      putSessionId,
    );

    const fileName = await executeQuery({ db: drizzle }, getActiveFileName, {
      fileId,
    });

    if (!fileName) {
      throw new ORPCError("NOT_FOUND", {
        message: `File ${fileId} not found`,
      });
    }

    // 名称相同则视为重复文档
    const existingDocument = await executeQuery(
      { db: drizzle },
      findProjectDocumentByName,
      {
        projectId,
        name: fileName,
        isDirectory: false,
      },
    );

    if (!existingDocument) {
      const service = pluginManager
        .getServices("FILE_IMPORTER")
        .find(({ service }) => service.canImport({ name: fileName }));

      if (!service)
        throw new ORPCError("NOT_FOUND", {
          message: "No suitable file handler found for this file",
        });

      const { document } = await drizzle.transaction(async (tx) => {
        // 创建文档
        const document = await createDocumentUnderParent(tx, {
          creatorId: user.id,
          projectId,
          fileHandlerId: service.dbId,
          fileId,
          name: fileName,
        });

        return { document };
      });

      await runGraph(
        upsertDocumentGraph,
        {
          documentId: document.id,
          fileId,
          languageId,
          vectorizerId: vectorizer.id,
          vectorStorageId: storage.id,
        },
        {
          pluginManager,
        },
      );
    } else {
      await runGraph(
        upsertDocumentGraph,
        {
          fileId,
          languageId,
          documentId: existingDocument.id,
          vectorizerId: vectorizer.id,
          vectorStorageId: storage.id,
        },
        {
          pluginManager,
        },
      );
    }
  });

export const get = authed
  .input(z.object({ documentId: z.uuidv4() }))
  .output(DocumentSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

    return await executeQuery({ db: drizzle }, getDocument, { documentId });
  });

export const countElement = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      searchQuery: z.string().default(""),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return await executeQuery({ db: drizzle }, countDocumentElements, input);
  });

export const getFirstElement = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      searchQuery: z.string().default(""),
      greaterThan: z.int().optional(),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(TranslatableElementSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return await executeQuery({ db: drizzle }, getDocumentFirstElement, input);
  });

export const exportTranslatedFile = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      languageId: z.string(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

    const document = await executeQuery(
      { db: drizzle },
      getDocumentFileExportContext,
      { documentId },
    );

    if (!document) {
      throw new ORPCError("NOT_FOUND", {
        message: `Document ${documentId} not found`,
      });
    }

    if (!document.fileId || !document.fileHandlerId)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "指定文档不是基于文件的",
      });

    // TODO 导出文件
  });

export const getElementTranslationStatus = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
    }),
  )
  .output(ElementTranslationStatusSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return await executeQuery(
      { db: drizzle },
      getDocumentElementTranslationStatus,
      input,
    );
  });

export const getElements = authed
  .input(
    z.object({
      documentId: z.string(),
      page: z.int().default(0),
      pageSize: z.int().default(16),
      searchQuery: z.string().default(""),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(
    z.array(
      TranslatableElementSchema.extend({
        value: z.string(),
        languageId: z.string(),
        status: ElementTranslationStatusSchema,
      }),
    ),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { isApproved, isTranslated } = input;

    if (isApproved !== undefined && isTranslated !== true) {
      throw new ORPCError("BAD_REQUEST", {
        message: "isTranslated must be true when isApproved is set",
      });
    }

    return await executeQuery({ db: drizzle }, getDocumentElements, input);
  });

export const getPageIndexOfElement = authed
  .input(
    z.object({
      elementId: z.int(),
      pageSize: z.int().default(16),
      searchQuery: z.string().default(""),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const { isApproved, isTranslated } = input;

    if (isApproved !== undefined && isTranslated !== true) {
      throw new ORPCError("BAD_REQUEST", {
        message: "isTranslated must be true when isApproved is set",
      });
    }

    return await executeQuery(
      { db: drizzle },
      getDocumentElementPageIndex,
      input,
    );
  });

export const del = authed
  .input(
    z.object({
      id: z.uuidv4(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    await executeCommand({ db: drizzle }, deleteDocument, {
      documentId: input.id,
    });
  });

export const getDocumentFileUrl = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
    }),
  )
  .output(z.string().nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;
    const { documentId } = input;

    const result = await executeQuery({ db: drizzle }, getDocumentBlobInfo, {
      documentId,
    });

    if (!result) {
      return null;
    }

    const { key, storageProviderId } = result;

    if (!key || !storageProviderId) return null;

    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      storageProviderId,
    );

    return await getDownloadUrl(
      sessionStore,
      provider,
      storageProviderId,
      key,
      120,
    );
  });

export const getDocumentFileInfo = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
    }),
  )
  .output(
    z
      .object({
        key: z.string(),
        storageProviderId: z.int(),
        fileName: z.string(),
      })
      .nullable(),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

    const result = await executeQuery({ db: drizzle }, getDocumentBlobInfo, {
      documentId,
    });

    if (!result || !result.key || !result.storageProviderId) {
      return null;
    }

    return {
      key: result.key,
      storageProviderId: result.storageProviderId,
      fileName: result.fileName || documentId,
    };
  });

export const countTranslation = authed
  .input(
    z.object({
      documentId: z.uuidv4(),
      languageId: z.string(),
      isApproved: z.boolean().optional(),
    }),
  )
  .output(z.int().min(0))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    return await executeQuery(
      { db: drizzle },
      countDocumentTranslations,
      input,
    );
  });
