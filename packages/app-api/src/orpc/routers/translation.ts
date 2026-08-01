import {
  approveTranslation,
  autoApproveOperationScopeTranslations,
  createAgentDefinition,
  createAgentSession,
  deleteTranslation,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  getAgentSessionByExternalId,
  getBranchById,
  getEditorScopeElementPageIndex,
  getElementWithChunkIds,
  getProjectTargetLanguages,
  getSelfTranslationVote,
  getTranslationVoteTotal,
  listBranchChangesetEntries,
  listEffectiveMemoryIdsByProject,
  listProjectGlossaryIds,
  listQaResultItems,
  listQaResultsByTranslation,
  listTranslationsByIds,
  listTranslationsByElement,
  unapproveTranslation,
  upsertTranslationVote,
  type OperationFailure,
} from "@cat/domain";
import {
  promoteApprovedTranslationMemoryOp,
  resolveOperationScopeElementsOp,
} from "@cat/operations";
import { getPermissionEngine } from "@cat/permissions";
import {
  AsyncMessageQueue,
  selectFirstServiceImplementation,
} from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import {
  EditorScopeSchema,
  OperationScopeSchema,
  QaResultItemSchema,
  QaResultSchema,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import { TranslationSchema, TranslationVoteSchema } from "@cat/shared";
import { JSONObjectSchema } from "@cat/shared";
import { EditorOverlayTranslationStateSchema } from "@cat/vcs";
import { getBranchChangesetId } from "@cat/vcs";
import {
  CreateTranslationPubPayloadSchema,
  batchAutoTranslateGraph,
  getGlobalGraphRuntime,
} from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import {
  directTranslationWriteContract,
  DirectTranslationWriteOutputSchema,
  invokeOperationContract,
} from "#/operation-contracts/index.ts";
import { withBranchContext } from "#/orpc/middleware/with-branch-context.ts";
import {
  operationInvocationContextFromORPC,
  projectOperationContractErrorToORPC,
} from "#/orpc/operation-contract-adapter.ts";
import {
  BranchAwareTranslationDataSchema,
  type BranchAwareTranslationData,
} from "#/orpc/routers/translation.schemas.ts";
import {
  authed,
  checkElementPermission,
  checkPermission,
  checkTranslationPermission,
} from "#/orpc/server.ts";
import type { Context } from "#/utils/context.ts";
import { getGraphRuntime } from "#/utils/graph-runtime.ts";
import {
  createVCSRouteHelper,
  ensureBranchWriteContext,
} from "#/utils/vcs-route-helper.ts";

const TranslationDataSchema = TranslationSchema.omit({
  updatedAt: true,
  stringId: true,
}).extend({
  vote: z.int(),
  text: z.string(),
});

type TranslationData = z.infer<typeof TranslationDataSchema>;
type CreateTranslationPubPayload = z.infer<
  typeof CreateTranslationPubPayloadSchema
>;

const toMainTranslationData = (
  item: TranslationData,
): BranchAwareTranslationData => ({
  kind: "main",
  ...item,
});

const toBranchOverlayTranslationData = (
  overlayEntityId: string,
  overlay: z.infer<typeof EditorOverlayTranslationStateSchema>,
): BranchAwareTranslationData => ({
  kind: "branch-overlay",
  overlayEntityId,
  translatableElementId: overlay.translatableElementId,
  languageId: overlay.languageId,
  text: overlay.text,
  translatorId: overlay.translatorId ?? null,
  approved: overlay.approved ?? false,
  vote: 0,
  createdAt: new Date(overlay.createdAt),
  updatedAt: new Date(overlay.updatedAt),
});

const buildBranchTranslationOperationFailure = (input: {
  message: string;
  projectId: string;
  elementId: number;
  reviewBlocker:
    | "branch_translation_write_failed"
    | "branch_write_context_unavailable";
}): OperationFailure => ({
  id: crypto.randomUUID(),
  code: "CAT_OPERATION_FAILED",
  message: input.message,
  severity: "error",
  retryable: true,
  affectedResources: [
    {
      type: "project",
      id: input.projectId,
    },
    {
      type: "translatable_element",
      id: String(input.elementId),
    },
  ],
  remediationHint:
    "Review the task context and retry after the underlying issue is resolved.",
  redactionBoundary: "internal",
  reviewBlocker: input.reviewBlocker,
});

const throwBranchTranslationOperationFailure = (input: {
  message: string;
  projectId: string;
  elementId: number;
  reviewBlocker:
    | "branch_translation_write_failed"
    | "branch_write_context_unavailable";
}): never => {
  const operationFailure = buildBranchTranslationOperationFailure(input);
  throw new ORPCError("INTERNAL_SERVER_ERROR", {
    message: input.message,
    data: {
      operationContractErrorIdentifier: "operation_failed",
      operationFailure,
    },
  });
};

const resolveCreateBranchContext = async (
  context: Context,
  input: { branchId?: number | undefined; projectId: string },
): Promise<{
  branchId: number;
  branchChangesetId?: number;
  branchProjectId: string;
} | null> => {
  const headerBranchId = context.helpers.getReqHeader("x-branch-id");
  const headerBranchProjectId = context.helpers.getReqHeader(
    "x-branch-project-id",
  );
  const parsedHeader =
    headerBranchId !== undefined ? Number(headerBranchId) : undefined;
  const parsedHeaderBranchId =
    parsedHeader !== undefined && Number.isFinite(parsedHeader)
      ? parsedHeader
      : undefined;
  const branchIdSource: "input" | "header" | "none" =
    input.branchId !== undefined
      ? "input"
      : parsedHeaderBranchId !== undefined
        ? "header"
        : "none";
  const branchId =
    branchIdSource === "input" ? input.branchId : parsedHeaderBranchId;

  if (branchIdSource === "none" || branchId === undefined) return null;

  if (branchIdSource === "header" && headerBranchProjectId === undefined) {
    throw new ORPCError("BAD_REQUEST", {
      message: "x-branch-id requires x-branch-project-id",
    });
  }

  if (
    branchIdSource === "header" &&
    headerBranchProjectId !== undefined &&
    headerBranchProjectId !== input.projectId
  ) {
    throw new ORPCError("BAD_REQUEST", {
      message: "x-branch-project-id does not match request projectId",
    });
  }

  const {
    drizzleDB: { client: drizzle },
  } = context;
  if (context.auth === null) {
    throw new ORPCError("UNAUTHORIZED");
  }
  const auth = context.auth;
  const branch = await executeQuery({ db: drizzle }, getBranchById, {
    branchId,
  });
  if (!branch) {
    throw new ORPCError("NOT_FOUND", {
      message: `Branch ${branchId} not found`,
    });
  }

  if (branch.status !== "ACTIVE") {
    throw new ORPCError("CONFLICT", {
      message: `Branch ${branchId} is not ACTIVE (status: ${branch.status})`,
    });
  }

  const allowed = await getPermissionEngine().check(
    auth,
    { type: "project", id: branch.projectId },
    "editor",
  );
  if (!allowed) {
    throw new ORPCError("FORBIDDEN", {
      message: "No editor permission on branch project",
    });
  }

  if (branch.projectId !== input.projectId) {
    throw new ORPCError("BAD_REQUEST", {
      message: `Branch ${branchId} does not belong to project ${input.projectId}`,
    });
  }

  const branchChangesetId =
    (await getBranchChangesetId(drizzle, branchId)) ?? undefined;
  return {
    branchId,
    ...(branchChangesetId === undefined ? {} : { branchChangesetId }),
    branchProjectId: branch.projectId,
  };
};

export const translationRouter = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .use(checkTranslationPermission("editor"), (i) => i.translationId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    await executeCommand({ db: drizzle }, deleteTranslation, input);
  });

export const create = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      elementId: z.int(),
      languageId: z.string(),
      text: z.string(),
      createMemory: z.boolean().default(true),
      branchId: z.int().optional(),
    }),
  )
  .output(DirectTranslationWriteOutputSchema.optional())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { elementId, languageId, text, createMemory } = input;
    const branchContext = await resolveCreateBranchContext(context, input);

    if (branchContext === null) {
      try {
        return await invokeOperationContract(
          directTranslationWriteContract,
          operationInvocationContextFromORPC(context),
          {
            projectId: input.projectId,
            elementId,
            languageId,
            text,
            createMemory,
          },
        );
      } catch (error) {
        return projectOperationContractErrorToORPC(error);
      }
    }

    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      {
        elementId,
      },
    );

    if (!element) {
      throw new ORPCError("NOT_FOUND", {
        message: `Element ${elementId} not found`,
      });
    }

    if (context.auth === null) {
      throw new ORPCError("UNAUTHORIZED");
    }
    const canEditElementProject = await getPermissionEngine().check(
      context.auth,
      { type: "project", id: element.projectId },
      "editor",
    );
    if (!canEditElementProject) {
      throw new ORPCError("FORBIDDEN", {
        message: "No editor permission on element project",
      });
    }

    if (element.projectId !== input.projectId) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Element ${elementId} does not belong to project ${input.projectId}`,
      });
    }

    if (
      branchContext.branchProjectId !== undefined &&
      branchContext.branchProjectId !== element.projectId
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Branch ${branchContext.branchId} does not belong to element project ${element.projectId}`,
      });
    }

    // Isolation write: record translation in branch changeset
    let branchWriteContext;
    try {
      branchWriteContext = await ensureBranchWriteContext({
        drizzle,
        branchId: branchContext.branchId,
        branchChangesetId: branchContext.branchChangesetId,
        branchProjectId: branchContext.branchProjectId,
      });
    } catch {
      return throwBranchTranslationOperationFailure({
        message: "Branch translation write failed",
        projectId: element.projectId,
        elementId,
        reviewBlocker: "branch_write_context_unavailable",
      });
    }

    if (branchWriteContext) {
      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = crypto.randomUUID();
      const timestamp = new Date().toISOString();
      try {
        await middleware.interceptWrite(
          branchWriteContext,
          "translation",
          entityId,
          "CREATE",
          null,
          EditorOverlayTranslationStateSchema.parse({
            translatableElementId: elementId,
            languageId,
            text,
            translatorId: user.id,
            approved: false,
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
          async () => undefined,
        );
      } catch {
        return throwBranchTranslationOperationFailure({
          message: "Branch translation write failed",
          projectId: element.projectId,
          elementId,
          reviewBlocker: "branch_translation_write_failed",
        });
      }
      return undefined;
    }

    return throwBranchTranslationOperationFailure({
      message: "Branch translation write failed",
      projectId: element.projectId,
      elementId,
      reviewBlocker: "branch_write_context_unavailable",
    });
  });

export const onCreate = authed
  .input(
    EditorScopeSchema.pick({
      projectId: true,
      languageToId: true,
      branchId: true,
      contentNodeIds: true,
      searchQuery: true,
      statusFilter: true,
      sortMode: true,
      pageSize: true,
    }),
  )
  .use(checkPermission("project", "viewer"), (i) => i.projectId)
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const queue = new AsyncMessageQueue<TranslationData>();

    const isEventInScope = async (payload: CreateTranslationPubPayload) => {
      if (payload.projectId !== input.projectId) return false;
      if (
        input.contentNodeIds.length === 0 &&
        input.searchQuery.trim() === ""
      ) {
        return true;
      }

      const pageIndexes = await Promise.all(
        payload.elementIds.map(async (elementId) =>
          executeQuery({ db: drizzle }, getEditorScopeElementPageIndex, {
            projectId: input.projectId,
            languageToId: input.languageToId,
            branchId: input.branchId,
            contentNodeIds: input.contentNodeIds,
            searchQuery: input.searchQuery,
            statusFilter: "all",
            sortMode: input.sortMode,
            pageSize: input.pageSize,
            elementId,
          }),
        ),
      );

      return pageIndexes.some((pageIndex) => pageIndex !== null);
    };

    const unsubscribe = getGlobalGraphRuntime().eventBus.subscribe(
      "workflow:translation:created",
      async (event) => {
        const parsed = await CreateTranslationPubPayloadSchema.safeParseAsync(
          event.payload,
        );
        if (!parsed.success) {
          logger
            .child({ component: "rpc" })
            .error("Invalid create translation payload", {
              error: parsed.error,
            });
          return;
        }

        if (!(await isEventInScope(parsed.data))) {
          return;
        }

        const translations = await executeQuery(
          { db: drizzle },
          listTranslationsByIds,
          { translationIds: parsed.data.translationIds },
        );
        queue.push(...translations);
      },
    );

    try {
      for await (const translations of queue.consume()) {
        yield translations;
      }
    } finally {
      unsubscribe();
      queue.clear();
    }
  });

export const getAll = authed
  .input(
    z.object({
      elementId: z.int(),
      languageId: z.string(),
      branchId: z.int().optional(),
    }),
  )
  .use(checkElementPermission("viewer"), (i) => i.elementId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.array(BranchAwareTranslationDataSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, languageId } = input;

    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      {
        elementId,
      },
    );

    if (!element) {
      throw new ORPCError("NOT_FOUND", {
        message: `Element ${elementId} not found`,
      });
    }

    if (
      context.branchProjectId !== undefined &&
      context.branchProjectId !== element.projectId
    ) {
      throw new ORPCError("BAD_REQUEST", {
        message: `Branch ${context.branchId} does not belong to element project ${element.projectId}`,
      });
    }

    const mainItems = await executeQuery(
      { db: drizzle },
      listTranslationsByElement,
      {
        elementId,
        languageId,
      },
    );

    if (context.branchId === undefined) {
      return mainItems.map(toMainTranslationData);
    }

    const branchEntries = await executeQuery(
      { db: drizzle },
      listBranchChangesetEntries,
      {
        branchId: context.branchId,
        entityType: "translation",
      },
    );

    const latestEntries = new Map<
      string,
      {
        action: string;
        after: unknown;
      }
    >();

    for (const entry of branchEntries) {
      if (latestEntries.has(entry.entityId)) continue;
      latestEntries.set(entry.entityId, {
        action: entry.action,
        after: entry.after,
      });
    }

    const result: BranchAwareTranslationData[] = [];

    for (const item of mainItems) {
      const entityId = String(item.id);
      const branchEntry = latestEntries.get(entityId);

      if (!branchEntry) {
        result.push(toMainTranslationData(item));
        continue;
      }

      latestEntries.delete(entityId);

      if (branchEntry.action === "DELETE") {
        continue;
      }

      const parsedMain = TranslationDataSchema.safeParse(branchEntry.after);
      if (parsedMain.success) {
        result.push(toMainTranslationData(parsedMain.data));
        continue;
      }

      const overlay = EditorOverlayTranslationStateSchema.parse(
        branchEntry.after,
      );
      result.push(toBranchOverlayTranslationData(entityId, overlay));
    }

    for (const [entityId, branchEntry] of latestEntries.entries()) {
      if (
        branchEntry.action !== "CREATE" ||
        branchEntry.after === null ||
        branchEntry.after === undefined
      ) {
        continue;
      }

      const parsedMain = TranslationDataSchema.safeParse(branchEntry.after);
      if (parsedMain.success) {
        result.push(toMainTranslationData(parsedMain.data));
        continue;
      }

      const overlay = EditorOverlayTranslationStateSchema.parse(
        branchEntry.after,
      );
      result.push(toBranchOverlayTranslationData(entityId, overlay));
    }

    return result;
  });

export const vote = authed
  .input(
    z.object({
      translationId: z.int(),
      value: z.int(),
    }),
  )
  .use(checkTranslationPermission("viewer"), (i) => i.translationId)
  .output(TranslationVoteSchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { translationId, value } = input;

    return await executeCommand({ db: drizzle }, upsertTranslationVote, {
      translationId,
      voterId: user.id,
      value,
    });
  });

export const countVote = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .use(checkTranslationPermission("viewer"), (i) => i.translationId)
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, getTranslationVoteTotal, input);
  });

export const getSelfVote = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .use(checkTranslationPermission("viewer"), (i) => i.translationId)
  .output(TranslationVoteSchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const { translationId } = input;

    return await executeQuery({ db: drizzle }, getSelfTranslationVote, {
      translationId,
      voterId: user.id,
    });
  });

export const autoApprove = authed
  .input(
    z.object({
      scope: OperationScopeSchema,
      languageId: z.string(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.scope.projectId)
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const { elements } = await resolveOperationScopeElementsOp({
      ...input.scope,
      languageToId: input.languageId,
      statusFilter: "translated",
    });

    if (elements.length === 0) return 0;

    const result = await executeCommand(
      { db: drizzle },
      autoApproveOperationScopeTranslations,
      {
        elementIds: elements.map((element) => element.id),
        languageId: input.languageId,
      },
    );

    await Promise.allSettled(
      result.approvedTranslationIds.map(async (translationId) => {
        try {
          await promoteApprovedTranslationMemoryOp({
            translationId,
            approvedById: user.id,
          });
        } catch (error) {
          logger
            .child({ component: "rpc" })
            .error(
              `approved translation memory promotion failed: ${translationId}`,
              { error: error },
            );
        }
      }),
    );

    return result.count;
  });

export const approve = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .use(checkTranslationPermission("editor"), (i) => i.translationId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    await executeCommand({ db: drizzle }, approveTranslation, input);

    try {
      await promoteApprovedTranslationMemoryOp({
        translationId: input.translationId,
        approvedById: user.id,
      });
    } catch (error) {
      logger
        .child({ component: "rpc" })
        .error(
          `approved translation memory promotion failed: ${input.translationId}`,
          { error: error },
        );
    }
  });

export const unapprove = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .use(checkTranslationPermission("editor"), (i) => i.translationId)
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    await executeCommand({ db: drizzle }, unapproveTranslation, input);
  });

export const autoTranslate = authed
  .input(
    z.object({
      scope: OperationScopeSchema,
      advisor: ServiceImplementationReferenceSchema.optional(),
      languageId: z.string(),
      minMemorySimilarity: z.number().min(0).max(1).default(0.72),
      maxMemoryAmount: z.int().min(0).default(3),
      config: batchAutoTranslateGraph.inputSchema.shape.config.optional(),
    }),
  )
  .use(checkPermission("project", "editor"), (i) => i.scope.projectId)
  .output(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;
    const {
      scope,
      advisor,
      languageId,
      minMemorySimilarity,
      maxMemoryAmount,
      config,
    } = input;

    const storage = selectFirstServiceImplementation(
      pluginManager,
      "VECTOR_STORAGE",
    );
    const vectorizer = selectFirstServiceImplementation(
      pluginManager,
      "TEXT_VECTORIZER",
    );

    if (!storage)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `No VECTOR_STORAGE service available`,
      });

    if (!vectorizer)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: `No TEXT_VECTORIZER service available`,
      });

    await resolveOperationScopeElementsOp({
      ...scope,
      languageToId: languageId,
      statusFilter: "untranslated",
    });

    const targetLanguages = await executeQuery(
      { db: drizzle },
      getProjectTargetLanguages,
      { projectId: scope.projectId },
    );

    if (!targetLanguages.some((item) => item.id === languageId)) {
      throw new ORPCError("BAD_REQUEST", {
        message: "Language is not claimed in project",
      });
    }

    const [effectiveMemoryIds, glossaryIds] = await Promise.all([
      executeQuery({ db: drizzle }, listEffectiveMemoryIdsByProject, {
        projectId: scope.projectId,
        userId: user.id,
      }),
      executeQuery({ db: drizzle }, listProjectGlossaryIds, {
        projectId: scope.projectId,
      }),
    ]);

    const memoryIds = Array.isArray(effectiveMemoryIds)
      ? effectiveMemoryIds
      : effectiveMemoryIds.allMemoryIds;

    // 查找或创建 auto-translate AgentDefinition
    let existingDef = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByNameAndScope,
      {
        name: "auto-translate",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );

    if (!existingDef) {
      await executeCommand({ db: drizzle }, createAgentDefinition, {
        name: "auto-translate",
        description: "自动翻译工作流",
        scopeType: "GLOBAL",
        scopeId: "",
        definitionId: "auto-translate",
        version: "1.0.0",
        type: "WORKFLOW",
        tools: [],
        content: "",
        isBuiltin: true,
      });
      existingDef = await executeQuery(
        { db: drizzle },
        findAgentDefinitionByNameAndScope,
        {
          name: "auto-translate",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      );
    }

    if (!existingDef) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to obtain auto-translate agent definition",
      });
    }

    const sessionResult = await executeCommand(
      { db: drizzle },
      createAgentSession,
      {
        agentDefinitionId: existingDef.externalId,
        userId: user.id,
        projectId: scope.projectId,
        metadata: {
          projectId: scope.projectId,
          languageId,
          contentNodeIds: scope.contentNodeIds,
          sortMode: scope.sortMode,
        },
      },
    );

    const sessionRow = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      { externalId: sessionResult.sessionId },
    );

    if (!sessionRow) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to resolve agent session",
      });
    }

    const runtime = await getGraphRuntime(drizzle, pluginManager);

    const graphInput = JSONObjectSchema.parse({
      ...scope,
      languageId,
      advisor,
      minMemorySimilarity,
      maxMemoryAmount,
      memoryVectorStorage: storage.reference,
      translationVectorStorage: storage.reference,
      vectorizer: vectorizer.reference,
      translatorId: user.id,
      memoryIds,
      glossaryIds,
      config,
    });

    const runId = await runtime.scheduler.start(
      "batch-auto-translate",
      graphInput,
      { sessionId: sessionRow.id, pluginManager },
    );

    return { runId };
  });

export const getQAResults = authed
  .input(
    z.object({
      translationId: z.int(),
    }),
  )
  .output(z.array(QaResultSchema))
  .handler(async ({ input, context }) => {
    const { translationId } = input;
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listQaResultsByTranslation, {
      translationId,
    });
  });

export const getQAResultItems = authed
  .input(
    z.object({
      qaResultId: z.int(),
    }),
  )
  .output(z.array(QaResultItemSchema))
  .handler(async ({ input, context }) => {
    const { qaResultId } = input;
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listQaResultItems, {
      qaResultId,
    });
  });
