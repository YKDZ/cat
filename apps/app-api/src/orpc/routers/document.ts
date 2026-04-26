import type { VCSContext } from "@cat/vcs";

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
import { DocumentSchema, TranslatableElementSchema } from "@cat/shared";
import { ElementTranslationStatusSchema, FileMetaSchema } from "@cat/shared";
import { sanitizeFileName } from "@cat/shared";
import { listWithOverlay, readWithOverlay } from "@cat/vcs";
import { runGraph, upsertDocumentGraph } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import {
  authed,
  checkDocumentPermission,
  checkElementPermission,
  checkPermission,
} from "@/orpc/server";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

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
      branchId: z.int().optional(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.projectId)
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectId,
  }))
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

    // Isolation write: record document creation in branch changeset
    if (
      context.branchId !== undefined &&
      context.branchChangesetId !== undefined
    ) {
      if (context.branchProjectId === undefined) {
        throw new Error(
          "branchProjectId missing when branch context is active",
        );
      }
      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = randomUUID();
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "document",
        entityId,
        "CREATE",
        null,
        { projectId, name: fileName, languageId },
        async () => undefined,
      );
      return;
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

      const vcsContext: VCSContext = {
        mode: "direct",
        projectId,
        createdBy: user.id,
      };
      const { middleware: vcsMiddleware } = createVCSRouteHelper(drizzle);

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
          vcsContext,
          vcsMiddleware,
        },
      );
    } else {
      const vcsContext: VCSContext = {
        mode: "direct",
        projectId,
        createdBy: user.id,
      };
      const { middleware: vcsMiddleware } = createVCSRouteHelper(drizzle);

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
          vcsContext,
          vcsMiddleware,
        },
      );
    }
  });

export const get = authed
  .input(z.object({ documentId: z.uuidv4(), branchId: z.int().optional() }))
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(DocumentSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

    if (context.branchId !== undefined) {
      const overlayEntry = await readWithOverlay<
        z.infer<typeof DocumentSchema>
      >(drizzle, context.branchId, "document", documentId);
      if (overlayEntry !== null) {
        if (overlayEntry.action === "DELETE") return null;
        return overlayEntry.data;
      }
    }

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
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
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
      afterElementId: z.int().optional(),
      isApproved: z.boolean().optional(),
      isTranslated: z.boolean().optional(),
      languageId: z.string().optional(),
    }),
  )
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
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
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
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
  .use(checkElementPermission("viewer"), (i) => i.elementId)
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
      branchId: z.int().optional(),
    }),
  )
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
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

    const mainItems = await executeQuery(
      { db: drizzle },
      getDocumentElements,
      input,
    );

    if (context.branchId !== undefined) {
      return await listWithOverlay(
        drizzle,
        context.branchId,
        "element",
        mainItems,
        (item) => String(item.id),
      );
    }

    return mainItems;
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
  .use(checkElementPermission("viewer"), (i) => i.elementId)
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
      branchId: z.int().optional(),
    }),
  )
  .use(checkDocumentPermission("editor"), (i) => i.id)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    if (
      context.branchId !== undefined &&
      context.branchChangesetId !== undefined
    ) {
      if (context.branchProjectId === undefined) {
        throw new Error(
          "branchProjectId missing when branch context is active",
        );
      }
      const { middleware } = createVCSRouteHelper(drizzle);
      const currentDoc = await executeQuery({ db: drizzle }, getDocument, {
        documentId: input.id,
      });
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "document",
        input.id,
        "DELETE",
        currentDoc,
        null,
        async () => undefined,
      );
      return;
    }

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
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
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
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
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
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
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
