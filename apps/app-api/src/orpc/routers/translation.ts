import type { VCSContext } from "@cat/vcs";

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
  getEditorScopeElementPageIndex,
  getElementWithChunkIds,
  getProjectTargetLanguages,
  getSelfTranslationVote,
  getTranslationVoteTotal,
  listMemoryIdsByProject,
  listProjectGlossaryIds,
  listQaResultItems,
  listQaResultsByTranslation,
  listTranslationsByIds,
  listTranslationsByElement,
  unapproveTranslation,
  upsertTranslationVote,
} from "@cat/domain";
import { resolveOperationScopeElementsOp } from "@cat/operations";
import { AsyncMessageQueue, firstOrGivenService } from "@cat/server-shared";
import { serverLogger as logger } from "@cat/server-shared";
import {
  EditorScopeSchema,
  OperationScopeSchema,
  QaResultItemSchema,
  QaResultSchema,
} from "@cat/shared";
import { TranslationSchema, TranslationVoteSchema } from "@cat/shared";
import { JSONObjectSchema } from "@cat/shared";
import { EditorOverlayTranslationStateSchema, listWithOverlay } from "@cat/vcs";
import {
  CreateTranslationPubPayloadSchema,
  batchAutoTranslateGraph,
  createTranslationGraph,
  getGlobalGraphRuntime,
  runGraph,
} from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import * as z from "zod";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import {
  authed,
  checkElementPermission,
  checkPermission,
  checkTranslationPermission,
} from "@/orpc/server";
import { getGraphRuntime } from "@/utils/graph-runtime";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

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
      elementId: z.int(),
      languageId: z.string(),
      text: z.string(),
      createMemory: z.boolean().default(true),
      branchId: z.int().optional(),
    }),
  )
  .use(checkElementPermission("editor"), (i) => i.elementId)
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
      pluginManager,
    } = context;
    const { elementId, languageId, text, createMemory } = input;

    // Isolation write: record translation in branch changeset
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
      const timestamp = new Date().toISOString();
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
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
      return;
    }

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

    if (!storage || !vectorizer) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "No storage provider available",
      });
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

    const memoryIds = await executeQuery(
      { db: drizzle },
      listMemoryIdsByProject,
      { projectId: element.projectId },
    );

    await runGraph(
      createTranslationGraph,
      {
        data: [
          {
            translatableElementId: elementId,
            text,
            languageId,
            translatorId: user.id,
          },
        ],
        memoryIds: createMemory ? memoryIds : [],
        vectorStorageId: storage.id,
        vectorizerId: vectorizer.id,
        translatorId: user.id,
      },
      {
        pluginManager,
        vcsContext: {
          mode: "direct",
          projectId: element.projectId,
          createdBy: user.id,
        } satisfies VCSContext,
        vcsMiddleware: createVCSRouteHelper(drizzle).middleware,
      },
    );
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
            .withSituation("RPC")
            .error(parsed.error, "Invalid create translation payload");
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
  .output(z.array(TranslationDataSchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, languageId } = input;

    const mainItems = await executeQuery(
      { db: drizzle },
      listTranslationsByElement,
      {
        elementId,
        languageId,
      },
    );

    if (context.branchId !== undefined) {
      return await listWithOverlay(
        drizzle,
        context.branchId,
        "translation",
        mainItems,
        (item) => String(item.id),
      );
    }

    return mainItems;
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
    } = context;

    const { elements } = await resolveOperationScopeElementsOp({
      ...input.scope,
      languageToId: input.languageId,
      statusFilter: "translated",
    });

    if (elements.length === 0) return 0;

    return await executeCommand(
      { db: drizzle },
      autoApproveOperationScopeTranslations,
      {
        elementIds: elements.map((element) => element.id),
        languageId: input.languageId,
      },
    );
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
    } = context;
    await executeCommand({ db: drizzle }, approveTranslation, input);
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
      advisorId: z.int().optional(),
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
      advisorId,
      languageId,
      minMemorySimilarity,
      maxMemoryAmount,
      config,
    } = input;

    const storage = firstOrGivenService(pluginManager, "VECTOR_STORAGE");
    const vectorizer = firstOrGivenService(pluginManager, "TEXT_VECTORIZER");

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

    const [memoryIds, glossaryIds] = await Promise.all([
      executeQuery({ db: drizzle }, listMemoryIdsByProject, {
        projectId: scope.projectId,
      }),
      executeQuery({ db: drizzle }, listProjectGlossaryIds, {
        projectId: scope.projectId,
      }),
    ]);

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
      advisorId,
      minMemorySimilarity,
      maxMemoryAmount,
      memoryVectorStorageId: storage.id,
      translationVectorStorageId: storage.id,
      vectorizerId: vectorizer.id,
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
