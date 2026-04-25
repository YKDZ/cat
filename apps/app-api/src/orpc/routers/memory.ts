import type { VCSContext } from "@cat/vcs";

import {
  countMemoryItems,
  createMemory as createMemoryCommand,
  executeCommand,
  executeQuery,
  getElementWithChunkIds,
  getMemory,
  listAllLanguages,
  listMemoryIdsByProject,
  listOwnedMemories,
  listProjectMemories,
} from "@cat/domain";
import {
  buildMemoryRecallBm25Capabilities,
  collectMemoryRecallOp,
  recallContextRerankOp,
} from "@cat/operations";
import { MemorySchema } from "@cat/shared";
import {
  MemoryRecallBm25CapabilityDirectorySchema,
  MemoryRecallBm25CapabilityQuerySchema,
} from "@cat/shared";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import {
  authed,
  base,
  checkElementPermission,
  checkPermission,
} from "@/orpc/server";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

export const create = authed
  .input(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      projectIds: z.array(z.uuidv4()).optional(),
      branchId: z.int().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({
    branchId: i.branchId,
    projectId: i.projectIds?.[0],
  }))
  .output(MemorySchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
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
      const entityId = crypto.randomUUID();

      return await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "memory_item",
        entityId,
        "CREATE",
        null,
        {
          name: input.name,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.projectIds !== undefined
            ? { projectIds: input.projectIds }
            : {}),
          creatorId: user.id,
        },
        async () => ({
          id: "00000000-0000-0000-0000-000000000000",
          externalId: entityId,
          name: input.name,
          description: input.description ?? null,
          creatorId: user.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );
    }

    const projectId = input.projectIds?.[0];
    if (projectId !== undefined) {
      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = crypto.randomUUID();
      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId,
        createdBy: user.id,
      };
      return await middleware.interceptWrite(
        vcsCtx,
        "memory_item",
        entityId,
        "CREATE",
        null,
        {
          name: input.name,
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.projectIds !== undefined
            ? { projectIds: input.projectIds }
            : {}),
          creatorId: user.id,
        },
        async () =>
          drizzle.transaction(async (tx) =>
            executeCommand({ db: tx }, createMemoryCommand, {
              ...input,
              creatorId: user.id,
            }),
          ),
      );
    }

    return await drizzle.transaction(async (tx) => {
      return executeCommand({ db: tx }, createMemoryCommand, {
        ...input,
        creatorId: user.id,
      });
    });
  });

export const onNew = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
      minConfidence: z.number().min(0).max(1).default(0.72),
      maxAmount: z.int().min(0).default(3),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, translationLanguageId, minConfidence, maxAmount } =
      input;

    // Fetch element details — text, language, project, and chunk IDs
    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      { elementId },
    );

    if (!element) {
      throw new Error(`Element ${elementId} not found`);
    }

    const memoryIds = await executeQuery(
      { db: drizzle },
      listMemoryIdsByProject,
      { projectId: element.projectId },
    );

    if (!element || memoryIds.length === 0) return;

    const reranked = await recallContextRerankOp(
      {
        elementId,
        queryText: element.value,
        memories: await collectMemoryRecallOp(
          {
            text: element.value,
            sourceLanguageId: element.languageId,
            translationLanguageId,
            memoryIds,
            chunkIds: element.chunkIds,
            minSimilarity: minConfidence,
            maxAmount,
          },
          {
            pluginManager: context.pluginManager,
            traceId: crypto.randomUUID(),
          },
        ),
      },
      {
        pluginManager: context.pluginManager,
        traceId: crypto.randomUUID(),
      },
    );

    for (const memory of reranked) {
      yield memory;
    }
  });

export const getUserOwned = authed
  .input(
    z.object({
      userId: z.uuidv4(),
    }),
  )
  .output(z.array(MemorySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listOwnedMemories, {
      creatorId: input.userId,
    });
  });

export const get = authed
  .input(
    z.object({
      memoryId: z.uuidv4(),
    }),
  )
  .use(checkPermission("memory", "viewer"), (i) => i.memoryId)
  .output(MemorySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, getMemory, input);
  });

export const getProjectOwned = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .output(z.array(MemorySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listProjectMemories, input);
  });

export const countItem = authed
  .input(
    z.object({
      memoryId: z.uuidv4(),
    }),
  )
  .use(checkPermission("memory", "viewer"), (i) => i.memoryId)
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, countMemoryItems, input);
  });

/**
 * @zh 基于文本的记忆回射。接受原始文本而非 elementId。
 * @en Text-based memory recall. Accepts raw text instead of an element ID.
 */
export const searchByText = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      text: z.string().min(1),
      sourceLanguageId: z.string(),
      translationLanguageId: z.string(),
      minConfidence: z.number().min(0).max(1).default(0.72),
      maxAmount: z.int().min(1).default(5),
    }),
  )
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const {
      projectId,
      text,
      sourceLanguageId,
      translationLanguageId,
      minConfidence,
      maxAmount,
    } = input;

    const memoryIds = await executeQuery(
      { db: drizzle },
      listMemoryIdsByProject,
      { projectId },
    );

    if (memoryIds.length === 0) return;

    const memories = await collectMemoryRecallOp(
      {
        text,
        sourceLanguageId,
        translationLanguageId,
        memoryIds,
        chunkIds: [],
        minSimilarity: minConfidence,
        maxAmount,
      },
      {
        pluginManager: context.pluginManager,
        traceId: crypto.randomUUID(),
      },
    );

    for (const memory of memories) {
      yield memory;
    }
  });

export const getRecallCapabilities = base
  .input(MemoryRecallBm25CapabilityQuerySchema)
  .output(MemoryRecallBm25CapabilityDirectorySchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const languages = await executeQuery({ db: drizzle }, listAllLanguages, {});
    const fullCatalog = languages.map((row) => row.id);

    return {
      capabilities: buildMemoryRecallBm25Capabilities(
        fullCatalog,
        input.languageIds,
      ),
    };
  });
