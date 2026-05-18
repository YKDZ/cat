import type { VCSContext } from "@cat/vcs";

import {
  countEditorScopeElements,
  countContentNodeTranslations,
  createContentNodeUnderParent,
  deleteContentNode,
  ensureCoreRelationTypes,
  executeCommand,
  executeQuery,
  findProjectContentNodeByLabel,
  getActiveFileName,
  getContentNode,
  getContentNodeBlobInfo,
  getContentNodeElementPageIndex,
  getEditorScopeFirstElement,
  getElementTranslationStatus as getElementTranslationStatusQuery,
  getProject,
  getProjectRootContentNode,
  listEditorScopeElements,
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
  type JSONType,
  TranslatableElementSchema,
} from "@cat/shared";
import { sanitizeFileName } from "@cat/shared";
import {
  EditorOverlayContentNodeRowSchema,
  EditorOverlayContentRelationRowSchema,
  readWithOverlay,
} from "@cat/vcs";
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

const toJSONType = (value: unknown): JSONType =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- VCS payloads must cross a JSON serialization boundary before being stored in changesets
  JSON.parse(JSON.stringify(value)) as JSONType;

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

    const service = pluginManager
      .getServices("FILE_IMPORTER")
      .find(({ service }) => service.canImport({ name: fileName }));

    if (!service)
      throw new ORPCError("NOT_FOUND", {
        message: "No suitable file handler found for this file",
      });

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

      const relationTypeIds = await executeCommand(
        { db: drizzle },
        ensureCoreRelationTypes,
        {},
      );
      const containsTypeId = relationTypeIds["core:contains:1.0.0"];

      if (containsTypeId === undefined) {
        throw new ORPCError("INTERNAL_SERVER_ERROR", {
          message: "Core contains relation type is missing",
        });
      }

      const { middleware } = createVCSRouteHelper(drizzle);
      const timestamp = new Date().toISOString();
      const entityId = randomUUID();
      const relationId = randomUUID();
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
        toJSONType(
          EditorOverlayContentNodeRowSchema.parse({
            id: entityId,
            projectId,
            creatorId: user.id,
            kind: "FILE",
            displayLabel: fileName,
            importerId: service.id,
            sourceRootRef: projectId,
            stableSourceNodeRef: fileName,
            sourceUri: null,
            sourcePath: null,
            sourceType: null,
            languageId,
            exportRole: "FILE",
            boundaryType: "FILE",
            fileHandlerId: service.dbId ?? null,
            fileId,
            lifecycleStatus: "ACTIVE",
            provenance: null,
            metadata: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        ),
        async () => undefined,
      );
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "content_relation",
        relationId,
        "CREATE",
        null,
        toJSONType(
          EditorOverlayContentRelationRowSchema.parse({
            id: relationId,
            projectId,
            relationTypeId: containsTypeId,
            sourceEndpointKind: "NODE",
            sourceNodeId: rootNode.id,
            sourceElementId: null,
            targetEndpointKind: "NODE",
            targetNodeId: entityId,
            targetElementId: null,
            isPrimary: true,
            localOrder: 0,
            confidenceBasisPoints: 10000,
            lifecycleStatus: "ACTIVE",
            weightHint: null,
            provenance: null,
            validationMetadata: null,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        ),
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

const legacyStatusFilter = (input: {
  isTranslated?: boolean;
  isApproved?: boolean;
}) => {
  if (input.isTranslated === false) return "untranslated" as const;
  if (input.isTranslated === true && input.isApproved === false) {
    return "unapproved" as const;
  }
  if (input.isApproved === true) return "approved" as const;
  if (input.isTranslated === true) return "translated" as const;
  return "all" as const;
};

const resolveLegacyDocumentScope = async (
  drizzle: Parameters<typeof executeQuery>[0]["db"],
  input: {
    documentId: string;
    languageId?: string;
    searchQuery?: string;
    isTranslated?: boolean;
    isApproved?: boolean;
    branchId?: number;
  },
) => {
  const node = await executeQuery({ db: drizzle }, getContentNode, {
    id: input.documentId,
  });

  if (!node) {
    throw new ORPCError("NOT_FOUND", {
      message: `Content node ${input.documentId} not found`,
    });
  }

  return {
    projectId: node.projectId,
    languageToId: input.languageId ?? "",
    branchId: input.branchId,
    contentNodeIds: [input.documentId],
    searchQuery: input.searchQuery ?? "",
    statusFilter: legacyStatusFilter(input),
    page: 1,
    pageSize: 16,
  };
};

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
    const scope = await resolveLegacyDocumentScope(drizzle, input);
    return await executeQuery({ db: drizzle }, countEditorScopeElements, scope);
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
    const scope = await resolveLegacyDocumentScope(drizzle, input);
    return await executeQuery({ db: drizzle }, getEditorScopeFirstElement, {
      ...scope,
      afterElementId: input.afterElementId ?? input.greaterThan,
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
    const scope = await resolveLegacyDocumentScope(drizzle, {
      ...input,
      branchId: context.branchId,
    });
    return await executeQuery({ db: drizzle }, listEditorScopeElements, {
      ...scope,
      page: input.page,
      pageSize: input.pageSize,
    });
  });

/**
 * @deprecated
 * @zh 该接口缺少 `documentId`/`contentNodeIds` 作用域输入，无法表达项目级编辑器范围；请改用 `orpc.editor.getElementPageIndex`。
 * @en This endpoint lacks `documentId`/`contentNodeIds` scope input and cannot represent project-level editor scopes; use `orpc.editor.getElementPageIndex` instead.
 */
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
