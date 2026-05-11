import type { VCSContext } from "@cat/vcs";

import {
  countContentNodeElements,
  countContentNodeTranslations,
  createContentNodeUnderParent,
  deleteContentNode,
  executeCommand,
  executeQuery,
  findProjectContentNodeByLabel,
  getActiveFileName,
  getContentNode,
  getContentNodeBlobInfo,
  getContentNodeElementPageIndex,
  getContentNodeElements,
  getContentNodeFirstElement,
  getElementTranslationStatus as getElementTranslationStatusQuery,
  getProject,
  getProjectRootContentNode,
} from "@cat/domain";
import { StorageProvider } from "@cat/plugin-core";
import {
  finishPresignedPutFile,
  firstOrGivenService,
  getDownloadUrl,
  getServiceFromDBId,
  preparePresignedPutFile,
} from "@cat/server-shared";
import {
  ContentNodeSchema,
  ElementTranslationStatusSchema,
  FileMetaSchema,
  TranslatableElementSchema,
} from "@cat/shared";
import { sanitizeFileName } from "@cat/shared";
import { listWithOverlay, readWithOverlay } from "@cat/vcs";
import { runGraph, upsertContentNodeGraph } from "@cat/workflow/tasks";
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
        "content_node",
        entityId,
        "CREATE",
        null,
        { projectId, displayLabel: fileName, languageId },
        async () => undefined,
      );
      return;
    }

    // 名称相同则视为重复节点
    const existingNode = await executeQuery(
      { db: drizzle },
      findProjectContentNodeByLabel,
      {
        projectId,
        displayLabel: fileName,
        kind: "FILE",
      },
    );

    const service = pluginManager
      .getServices("FILE_IMPORTER")
      .find(({ service }) => service.canImport({ name: fileName }));

    if (!service)
      throw new ORPCError("NOT_FOUND", {
        message: "No suitable file handler found for this file",
      });

    let targetContentNodeId: string;

    if (!existingNode) {
      const rootNode = await executeQuery(
        { db: drizzle },
        getProjectRootContentNode,
        { projectId },
      );

      if (!rootNode) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: `Project ${projectId} has no root content node`,
        });
      }

      const newNode = await executeCommand(
        { db: drizzle },
        createContentNodeUnderParent,
        {
          projectId,
          creatorId: user.id,
          parentContentNodeId: rootNode.id,
          kind: "FILE",
          displayLabel: fileName,
          importerId: service.id,
          sourceRootRef: projectId,
          stableSourceNodeRef: fileName,
          exportRole: "FILE",
          boundaryType: "FILE",
          fileHandlerId: service.dbId,
          fileId,
          localOrder: 0,
        },
      );

      targetContentNodeId = newNode.id;
    } else {
      targetContentNodeId = existingNode.id;
    }

    const vcsContext: VCSContext = {
      mode: "direct",
      projectId,
      createdBy: user.id,
    };
    const { middleware: vcsMiddleware } = createVCSRouteHelper(drizzle);

    await runGraph(
      upsertContentNodeGraph,
      {
        projectId,
        contentNodeId: targetContentNodeId,
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
  });

export const get = authed
  .input(z.object({ documentId: z.uuidv4(), branchId: z.int().optional() }))
  .use(checkDocumentPermission("viewer"), (i) => i.documentId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(ContentNodeSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { documentId } = input;

    if (context.branchId !== undefined) {
      const overlayEntry = await readWithOverlay<
        z.infer<typeof ContentNodeSchema>
      >(drizzle, context.branchId, "content_node", documentId);
      if (overlayEntry !== null) {
        if (overlayEntry.action === "DELETE") return null;
        return overlayEntry.data;
      }
    }

    return await executeQuery({ db: drizzle }, getContentNode, {
      id: documentId,
    });
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
    return await executeQuery({ db: drizzle }, countContentNodeElements, {
      contentNodeId: input.documentId,
      searchQuery: input.searchQuery,
      isApproved: input.isApproved,
      isTranslated: input.isTranslated,
      languageId: input.languageId,
    });
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
    return await executeQuery({ db: drizzle }, getContentNodeFirstElement, {
      contentNodeId: input.documentId,
      searchQuery: input.searchQuery,
      greaterThan: input.greaterThan,
      afterElementId: input.afterElementId,
      isApproved: input.isApproved,
      isTranslated: input.isTranslated,
      languageId: input.languageId,
    });
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

    const node = await executeQuery({ db: drizzle }, getContentNode, {
      id: documentId,
    });

    if (!node) {
      throw new ORPCError("NOT_FOUND", {
        message: `Document ${documentId} not found`,
      });
    }

    if (!node.fileId || !node.fileHandlerId)
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
      getElementTranslationStatusQuery,
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
      getContentNodeElements,
      {
        contentNodeId: input.documentId,
        page: input.page,
        pageSize: input.pageSize,
        searchQuery: input.searchQuery,
        isApproved: input.isApproved,
        isTranslated: input.isTranslated,
        languageId: input.languageId,
      },
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
      getContentNodeElementPageIndex,
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
      const currentNode = await executeQuery({ db: drizzle }, getContentNode, {
        id: input.id,
      });
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "content_node",
        input.id,
        "DELETE",
        currentNode,
        null,
        async () => undefined,
      );
      return;
    }

    await executeCommand({ db: drizzle }, deleteContentNode, {
      contentNodeId: input.id,
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

    const result = await executeQuery({ db: drizzle }, getContentNodeBlobInfo, {
      contentNodeId: documentId,
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

    const result = await executeQuery({ db: drizzle }, getContentNodeBlobInfo, {
      contentNodeId: documentId,
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
    return await executeQuery({ db: drizzle }, countContentNodeTranslations, {
      contentNodeId: input.documentId,
      languageId: input.languageId,
      isApproved: input.isApproved,
    });
  });
