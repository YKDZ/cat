import type { VCSContext } from "@cat/vcs";

import {
  countMemoryItems,
  createMemory as createMemoryCommand,
  deleteMemoryItem,
  executeCommand,
  executeQuery,
  getElementWithChunkIds,
  getMemory,
  getMemoryAccessContext,
  listAllLanguages,
  listEffectiveMemoryIdsByProject,
  listMemoryItems,
  listMemoryItemIdsByElement,
  listOwnedMemories,
  listProjectMemories,
} from "@cat/domain";
import {
  buildMemoryRecallBm25Capabilities,
  collectEffectiveMemoryRecallOp,
  nlpSegmentOp,
  recallContextRerankOp,
} from "@cat/operations";
import { getPermissionEngine } from "@cat/permissions";
import { MemorySchema } from "@cat/shared";
import {
  MemoryRecallBm25CapabilityDirectorySchema,
  MemoryRecallBm25CapabilityQuerySchema,
} from "@cat/shared";
import { ORPCError } from "@orpc/server";
import * as z from "zod";

import type { Context } from "@/utils/context";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import {
  authed,
  base,
  checkElementPermission,
  checkPermission,
} from "@/orpc/server";
import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "@/utils/vcs-route-helper";

type MemoryAccessContext = Awaited<ReturnType<typeof getMemoryAccessContext>>;
type AuthedPrincipal = {
  auth: NonNullable<Context["auth"]>;
  user: NonNullable<Context["user"]>;
};

type EffectiveMemoryIds = {
  projectMemoryIds: string[];
  personalMemoryIds: string[];
  allMemoryIds: string[];
};

const normalizeEffectiveMemoryIds = (
  input: EffectiveMemoryIds | string[],
): EffectiveMemoryIds => {
  if (Array.isArray(input)) {
    return {
      projectMemoryIds: input,
      personalMemoryIds: [],
      allMemoryIds: input,
    };
  }

  return input;
};

const canReadMemory = async (
  context: AuthedPrincipal,
  accessContext: MemoryAccessContext,
) => {
  if (!accessContext) return false;

  if (accessContext.scope === "PERSONAL") {
    return accessContext.personalOwnerId === context.user.id;
  }

  const engine = getPermissionEngine();

  if (
    await engine.check(
      context.auth,
      { type: "memory", id: accessContext.memoryId },
      "viewer",
    )
  ) {
    return true;
  }

  const projectChecks = await Promise.all(
    accessContext.projectIds.map(
      async (projectId) =>
        await engine.check(
          context.auth,
          { type: "project", id: projectId },
          "viewer",
        ),
    ),
  );

  return projectChecks.some(Boolean);
};

const canDeleteMemoryItem = async (
  context: AuthedPrincipal,
  accessContext: MemoryAccessContext,
) => {
  if (!accessContext) return false;

  if (accessContext.scope === "PERSONAL") {
    return accessContext.personalOwnerId === context.user.id;
  }

  const engine = getPermissionEngine();

  if (
    await engine.check(
      context.auth,
      { type: "memory", id: accessContext.memoryId },
      "editor",
    )
  ) {
    return true;
  }

  const projectChecks = await Promise.all(
    accessContext.projectIds.map(
      async (projectId) =>
        await engine.check(
          context.auth,
          { type: "project", id: projectId },
          "editor",
        ),
    ),
  );

  return projectChecks.some(Boolean);
};

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

    if (context.branchId !== undefined) {
      if (
        input.projectIds === undefined ||
        input.projectIds.length !== 1 ||
        input.projectIds[0] !== context.branchProjectId
      ) {
        throw new ORPCError("BAD_REQUEST", {
          message:
            "Branch memory creation requires exactly one projectId matching the active branch project",
        });
      }

      const branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: context.branchId,
        branchChangesetId: context.branchChangesetId,
        branchProjectId: context.branchProjectId,
      });

      if (!branchWriteContext) {
        throw new Error("branch write context missing for memory creation");
      }

      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = crypto.randomUUID();

      return await middleware.interceptWrite(
        branchWriteContext,
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
          name: input.name,
          description: input.description ?? null,
          scope: "PROJECT" as const,
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

    const effectiveMemoryIdsRaw = await executeQuery(
      { db: drizzle },
      listEffectiveMemoryIdsByProject,
      {
        projectId: element.projectId,
        userId: context.user.id,
      },
    );

    const effectiveMemoryIds = normalizeEffectiveMemoryIds(
      effectiveMemoryIdsRaw,
    );

    const { projectMemoryIds, personalMemoryIds } = effectiveMemoryIds;

    if (
      !element ||
      (projectMemoryIds.length === 0 && personalMemoryIds.length === 0)
    ) {
      return;
    }

    const [excludeMemoryItemIds, nlpResult] = await Promise.all([
      executeQuery({ db: drizzle }, listMemoryItemIdsByElement, {
        elementId,
      }).catch(() => [] as string[]),
      nlpSegmentOp(
        { text: element.value, languageId: element.languageId },
        { pluginManager: context.pluginManager, traceId: crypto.randomUUID() },
      ).catch(() => null),
    ]);
    const sourceNlpTokens = nlpResult?.tokens;

    const reranked = await recallContextRerankOp(
      {
        elementId,
        queryText: element.value,
        memories: await collectEffectiveMemoryRecallOp(
          {
            text: element.value,
            sourceLanguageId: element.languageId,
            translationLanguageId,
            projectMemoryIds,
            personalMemoryIds,
            chunkIds: element.chunkIds,
            minSimilarity: minConfidence,
            maxAmount,
            excludeMemoryItemIds,
            sourceNlpTokens,
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
  .output(MemorySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      auth,
      user,
    } = context;

    const accessContext = await executeQuery(
      { db: drizzle },
      getMemoryAccessContext,
      { memoryId: input.memoryId },
    );

    if (!accessContext) {
      return null;
    }

    if (!(await canReadMemory({ auth, user }, accessContext))) {
      throw new ORPCError("FORBIDDEN");
    }

    return await executeQuery({ db: drizzle }, getMemory, input);
  });

export const listItems = authed
  .input(
    z.object({
      memoryId: z.uuidv4(),
      pageIndex: z.int().min(1).default(1),
      pageSize: z.int().min(1).max(100).default(20),
      searchText: z.string().trim().min(1).optional(),
    }),
  )
  .output(
    z.object({
      total: z.int().min(0),
      items: z.array(
        z.object({
          id: z.int(),
          memoryId: z.uuidv4(),
          source: z.string(),
          translation: z.string(),
          sourceLanguageId: z.string(),
          translationLanguageId: z.string(),
          sourceElementId: z.int().nullable(),
          translationId: z.int().nullable(),
          creatorId: z.uuidv4().nullable(),
          createdAt: z.coerce.date(),
          updatedAt: z.coerce.date(),
          sourceScope: z.enum(["PROJECT", "PERSONAL"]),
          promotedTargetMemoryItemId: z.int().nullable(),
        }),
      ),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      auth,
      user,
    } = context;

    const accessContext = await executeQuery(
      { db: drizzle },
      getMemoryAccessContext,
      { memoryId: input.memoryId },
    );

    if (!accessContext) {
      throw new ORPCError("NOT_FOUND");
    }

    if (!(await canReadMemory({ auth, user }, accessContext))) {
      throw new ORPCError("FORBIDDEN");
    }

    return await executeQuery({ db: drizzle }, listMemoryItems, input);
  });

export const deleteItem = authed
  .input(
    z.object({
      memoryItemId: z.int(),
      memoryId: z.uuidv4(),
      reason: z.string().trim().max(500).optional(),
      branchId: z.int().optional(),
    }),
  )
  .use(withBranchContext, (input) => ({ branchId: input.branchId }))
  .output(z.object({ deleted: z.boolean() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      auth,
      user,
    } = context;

    const accessContext = await executeQuery(
      { db: drizzle },
      getMemoryAccessContext,
      { memoryId: input.memoryId },
    );

    if (!accessContext) {
      return { deleted: false };
    }

    if (!(await canDeleteMemoryItem({ auth, user }, accessContext))) {
      throw new ORPCError("FORBIDDEN");
    }

    if (accessContext.scope === "PROJECT") {
      const projectId = accessContext.projectIds[0];
      if (!projectId) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Project-scoped memory is missing project binding",
        });
      }

      const { middleware } = createVCSRouteHelper(drizzle);
      const payload = {
        memoryItemId: input.memoryItemId,
        memoryId: input.memoryId,
        deletedById: user.id,
        scope: accessContext.scope,
        projectId,
        ...(input.reason !== undefined ? { reason: input.reason } : {}),
      };

      if (context.branchId !== undefined) {
        if (context.branchProjectId === undefined) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Invalid branch context for memory deletion",
          });
        }

        if (!accessContext.projectIds.includes(context.branchProjectId)) {
          throw new ORPCError("FORBIDDEN", {
            message: "Branch does not belong to the memory project",
          });
        }

        const branchWriteContext = await ensureBranchWriteContext({
          drizzle,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
          branchProjectId: context.branchProjectId,
        });

        if (!branchWriteContext) {
          throw new ORPCError("BAD_REQUEST", {
            message: "Invalid branch context for memory deletion",
          });
        }

        await middleware.interceptWrite(
          branchWriteContext,
          "memory_item",
          String(input.memoryItemId),
          "DELETE",
          payload,
          null,
          async () => undefined,
        );

        return { deleted: true };
      }

      const vcsCtx: VCSContext = {
        mode: "direct",
        projectId,
        createdBy: user.id,
      };

      const result = await middleware.interceptWrite(
        vcsCtx,
        "memory_item",
        String(input.memoryItemId),
        "DELETE",
        payload,
        { deleted: true },
        async () =>
          await executeCommand({ db: drizzle }, deleteMemoryItem, {
            memoryItemId: input.memoryItemId,
            deletedById: user.id,
            scope: accessContext.scope,
            projectId,
            reason: input.reason,
          }),
      );

      return { deleted: result.deleted };
    }

    const result = await executeCommand({ db: drizzle }, deleteMemoryItem, {
      memoryItemId: input.memoryItemId,
      deletedById: user.id,
      scope: accessContext.scope,
      projectId: accessContext.projectIds[0] ?? accessContext.personalProjectId,
      reason: input.reason,
    });

    return { deleted: result.deleted };
  });

export const getMyProjectMemory = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .use(checkPermission("project", "viewer"), (input) => input.projectId)
  .output(MemorySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const idsRaw = await executeQuery(
      { db: drizzle },
      listEffectiveMemoryIdsByProject,
      {
        projectId: input.projectId,
        userId: user.id,
      },
    );

    const ids = normalizeEffectiveMemoryIds(idsRaw);

    const memoryId = ids.personalMemoryIds[0];
    if (!memoryId) return null;

    return await executeQuery({ db: drizzle }, getMemory, { memoryId });
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

    const effectiveMemoryIdsRaw = await executeQuery(
      { db: drizzle },
      listEffectiveMemoryIdsByProject,
      {
        projectId,
        userId: context.user.id,
      },
    );

    const effectiveMemoryIds = normalizeEffectiveMemoryIds(
      effectiveMemoryIdsRaw,
    );

    const { projectMemoryIds, personalMemoryIds } = effectiveMemoryIds;

    if (projectMemoryIds.length === 0 && personalMemoryIds.length === 0) {
      return;
    }

    const memories = await collectEffectiveMemoryRecallOp(
      {
        text,
        sourceLanguageId,
        translationLanguageId,
        projectMemoryIds,
        personalMemoryIds,
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
