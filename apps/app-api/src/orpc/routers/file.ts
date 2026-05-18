import type { JSONType } from "@cat/shared";
import type { VCSContext } from "@cat/vcs";

import {
  createContentNodeUnderParent,
  ensureCoreRelationTypes,
  executeCommand,
  executeQuery,
  findProjectContentNodeByLabel,
  getActiveFileName,
  getContentNode,
  getContentNodeBlobInfo,
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
import { FileMetaSchema, type ContentNode } from "@cat/shared";
import { sanitizeFileName } from "@cat/shared";
import {
  EditorOverlayContentNodeRowSchema,
  EditorOverlayContentRelationRowSchema,
} from "@cat/vcs";
import { runGraph, upsertContentNodeGraph } from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import {
  authed,
  checkContentNodePermission,
  checkPermission,
} from "@/orpc/server";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

const toJSONType = (value: unknown): JSONType =>
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- VCS payloads must cross a JSON serialization boundary before being stored in changesets
  JSON.parse(JSON.stringify(value)) as JSONType;

const assertFileCapability = (node: {
  id: string;
  fileId: number | null;
  fileHandlerId: number | null;
  exportRole: string | null;
  boundaryType: string | null;
}) => {
  if (node.fileId === null || node.fileHandlerId === null) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Content node ${node.id} does not support file operations`,
    });
  }
};

const getRequiredContentNode = async (
  drizzle: Parameters<typeof executeQuery>[0]["db"],
  contentNodeId: string,
): Promise<ContentNode> => {
  const node = await executeQuery({ db: drizzle }, getContentNode, {
    id: contentNodeId,
  });

  if (!node) {
    throw new ORPCError("NOT_FOUND", {
      message: `Content node ${contentNodeId} not found`,
    });
  }

  return node;
};

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

    const storage = firstOrGivenService(pluginManager, "STORAGE_PROVIDER");

    if (!storage) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider found",
      });
    }

    const name = sanitizeFileName(meta.name);
    const key = join("files", randomUUID() + name);

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

    if (!service) {
      throw new ORPCError("NOT_FOUND", {
        message: "No suitable file handler found for this file",
      });
    }

    // Isolation write: record file content-node creation in branch changeset
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

export const getUrl = authed
  .input(
    z.object({
      contentNodeId: z.uuidv4(),
    }),
  )
  .use(checkContentNodePermission("viewer"), (i) => i.contentNodeId)
  .output(z.string().nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      sessionStore,
      pluginManager,
    } = context;

    const node = await getRequiredContentNode(drizzle, input.contentNodeId);
    assertFileCapability(node);

    const result = await executeQuery({ db: drizzle }, getContentNodeBlobInfo, {
      contentNodeId: input.contentNodeId,
    });

    if (!result) return null;

    const { key, storageProviderId } = result;
    if (!key || !storageProviderId) return null;

    const provider = getServiceFromDBId<StorageProvider>(
      pluginManager,
      storageProviderId,
    );

    return getDownloadUrl(sessionStore, provider, storageProviderId, key, 120);
  });

export const getInfo = authed
  .input(
    z.object({
      contentNodeId: z.uuidv4(),
    }),
  )
  .use(checkContentNodePermission("viewer"), (i) => i.contentNodeId)
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

    const node = await getRequiredContentNode(drizzle, input.contentNodeId);
    assertFileCapability(node);

    const result = await executeQuery({ db: drizzle }, getContentNodeBlobInfo, {
      contentNodeId: input.contentNodeId,
    });

    if (!result || !result.key || !result.storageProviderId) {
      return null;
    }

    return {
      key: result.key,
      storageProviderId: result.storageProviderId,
      fileName: result.fileName || node.displayLabel,
    };
  });

export const exportTranslated = authed
  .input(
    z.object({
      contentNodeId: z.uuidv4(),
      languageId: z.string(),
    }),
  )
  .use(checkContentNodePermission("viewer"), (i) => i.contentNodeId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const node = await getRequiredContentNode(drizzle, input.contentNodeId);
    assertFileCapability(node);

    void input.languageId;
    void node;

    // TODO 导出文件
  });
