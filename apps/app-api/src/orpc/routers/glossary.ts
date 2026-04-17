import {
  addGlossaryTermToConcept,
  countGlossaryConcepts,
  createAgentDefinition,
  createAgentSession,
  createInProcessCollector,
  createGlossary as createGlossaryCommand,
  deleteGlossaryTerm,
  domainEventBus,
  executeCommand,
  executeQuery,
  findAgentDefinitionByNameAndScope,
  getAgentSessionByExternalId,
  getElementWithChunkIds,
  getGlossary,
  listGlossaryConceptSubjects,
  listOwnedGlossaries,
  listProjectDocuments,
  listProjectGlossaryIds,
  listProjectGlossaries,
  loadAgentRunMetadata,
  updateGlossaryConcept,
} from "@cat/domain";
import { rerankTermRecallOp, termRecallOp } from "@cat/operations";
import { firstOrGivenService } from "@cat/server-shared";
import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import { TermStatusValues, TermTypeValues } from "@cat/shared/schema/enum";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { listWithOverlay } from "@cat/vcs";
import {
  createTermGraph,
  runGraph,
  termAlignmentGraph,
  termDiscoveryGraph,
} from "@cat/workflow/tasks";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { withBranchContext } from "@/orpc/middleware/with-branch-context";
import { authed, checkPermission } from "@/orpc/server";
import { getGraphRuntime } from "@/utils/graph-runtime";
import { createVCSRouteHelper } from "@/utils/vcs-route-helper";

export const deleteTerm = authed
  .input(
    z.object({
      termId: z.int(),
      branchId: z.int().optional(),
    }),
  )
  .use(checkPermission("glossary", "editor"), (input) =>
    input.termId.toString(),
  )
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
      const { middleware } = createVCSRouteHelper(drizzle);
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId!,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "term",
        String(input.termId),
        "DELETE",
        { termId: input.termId },
        null,
        async () => undefined,
      );
      return;
    }

    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      deleteGlossaryTerm,
      input,
    );

    if (result.deleted) {
      await collector.flush();
    }
  });

export const get = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
  .use(checkPermission("glossary", "viewer"), (i) => i.glossaryId)
  .output(GlossarySchema.nullable())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, getGlossary, input);
  });

export const getUserOwned = authed
  .input(
    z.object({
      userId: z.uuidv4(),
    }),
  )
  .output(z.array(GlossarySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listOwnedGlossaries, {
      creatorId: input.userId,
    });
  });

export const getProjectOwned = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
    }),
  )
  .output(z.array(GlossarySchema))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listProjectGlossaries, input);
  });

export const countTerm = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
    }),
  )
  .output(z.int())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, countGlossaryConcepts, input);
  });

export const create = authed
  .input(
    z.object({
      name: z.string(),
      description: z.string().optional(),
      projectIds: z.array(z.uuidv4()).optional(),
    }),
  )
  .output(GlossarySchema)
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const collector = createInProcessCollector(domainEventBus);

    const created = await drizzle.transaction(async (tx) => {
      return executeCommand({ db: tx, collector }, createGlossaryCommand, {
        ...input,
        creatorId: user.id,
      });
    });

    await collector.flush();
    return created;
  });

export const insertTerm = authed
  .input(
    z.object({
      glossaryId: z.uuidv4(),
      termsData: z.array(TermDataSchema),
      branchId: z.int().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const { pluginManager, user } = context;
    const { termsData, glossaryId } = input;

    if (
      context.branchId !== undefined &&
      context.branchChangesetId !== undefined
    ) {
      const {
        drizzleDB: { client: drizzle },
      } = context;
      const { middleware } = createVCSRouteHelper(drizzle);
      const entityId = crypto.randomUUID();
      await middleware.interceptWrite(
        {
          mode: "isolation",
          projectId: context.branchProjectId!,
          branchId: context.branchId,
          branchChangesetId: context.branchChangesetId,
        },
        "term",
        entityId,
        "CREATE",
        null,
        { glossaryId, termsData, creatorId: user.id },
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

    await runGraph(
      createTermGraph,
      {
        glossaryId,
        data: termsData,
        creatorId: user.id,
        vectorizerId: vectorizer.id,
        vectorStorageId: storage.id,
      },
      { pluginManager },
    );
  });

export const searchTerm = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      text: z.string(),
      termLanguageId: z.string(),
      translationLanguageId: z.string(),
      minConfidence: z.number().min(0).max(1).optional().default(0.6),
    }),
  )
  // Streams results: ILIKE matches arrive first, semantic matches follow.
  .handler(async function* ({ context, input }) {
    // jsgen: generator required — no arrow-function equivalent for async generators
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const {
      text,
      termLanguageId,
      translationLanguageId,
      projectId,
      minConfidence,
    } = input;

    const glossaryIds = await executeQuery(
      { db: drizzle },
      listProjectGlossaryIds,
      { projectId },
    );

    const recall = await termRecallOp(
      {
        glossaryIds,
        text,
        sourceLanguageId: termLanguageId,
        translationLanguageId,
      },
      {
        pluginManager: context.pluginManager,
        traceId: crypto.randomUUID(),
      },
    );

    for (const term of recall.terms) {
      if (term.confidence < minConfidence) continue;
      yield {
        ...term,
        termLanguageId,
        translationLanguageId,
      };
    }
  });

export const findTerm = authed
  .input(
    z.object({
      elementId: z.int(),
      translationLanguageId: z.string(),
      minConfidence: z.number().optional().default(0.6),
    }),
  )
  // This endpoint streams term suggestions to avoid blocking response while waiting for worker
  .handler(async function* ({ context, input }) {
    // jsgen: generator required — no arrow-function equivalent for async generators
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const { elementId, translationLanguageId, minConfidence } = input;

    const element = await executeQuery(
      { db: drizzle },
      getElementWithChunkIds,
      { elementId },
    );

    if (element === null) {
      throw new ORPCError("NOT_FOUND", {
        message: `Element with ID ${elementId} not found`,
      });
    }

    const glossaryIds = await executeQuery(
      { db: drizzle },
      listProjectGlossaryIds,
      { projectId: element.projectId },
    );

    const recall = await termRecallOp(
      {
        glossaryIds,
        text: element.value,
        sourceLanguageId: element.languageId,
        translationLanguageId,
      },
      {
        pluginManager: context.pluginManager,
        traceId: crypto.randomUUID(),
      },
    );

    const reranked = await rerankTermRecallOp({
      elementId,
      queryText: element.value,
      terms: recall.terms,
    });

    for (const term of reranked) {
      if (term.confidence < minConfidence) continue;
      yield {
        ...term,
        termLanguageId: element.languageId,
        translationLanguageId,
      };
    }
  });

export const updateConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      subjectIds: z.array(z.int()).optional(),
      definition: z.string().optional(),
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      updateGlossaryConcept,
      input,
    );

    if (result.updated) {
      await collector.flush();
    }
  });

export const addTermToConcept = authed
  .input(
    z.object({
      conceptId: z.int(),
      text: z.string(),
      languageId: z.string(),
      type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
      status: z.enum(TermStatusValues).optional().default("PREFERRED"),
    }),
  )
  .output(z.object({ termId: z.int() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;
    const collector = createInProcessCollector(domainEventBus);

    const result = await executeCommand(
      { db: drizzle, collector },
      addGlossaryTermToConcept,
      {
        ...input,
        creatorId: user.id,
      },
    );
    await collector.flush();

    return {
      termId: result.termId,
    };
  });

export const getConceptSubjects = authed
  .input(
    z.object({
      glossaryId: z.string(),
      branchId: z.int().optional(),
    }),
  )
  .use(withBranchContext, (i) => ({ branchId: i.branchId }))
  .output(z.array(z.object({ id: z.int(), subject: z.string() })))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const mainItems = await executeQuery(
      { db: drizzle },
      listGlossaryConceptSubjects,
      {
        glossaryId: input.glossaryId,
      },
    );

    if (context.branchId !== undefined) {
      return await listWithOverlay(
        drizzle,
        context.branchId,
        "term",
        mainItems,
        (item) => String(item.id),
      );
    }

    return mainItems;
  });

// ─── Workflow Runner — Term Discovery ────────────────────────────────────────

/** 启动术语发现工作流，返回 runId */
export const startTermDiscovery = authed
  .input(
    termDiscoveryGraph.inputSchema.extend({
      /** 关联的项目 ID（用于在 WorkflowUI 中显示） */
      projectId: z.uuidv4(),
    }),
  )
  .output(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;

    const runtime = await getGraphRuntime(drizzle, pluginManager);

    // 找或创建 WORKFLOW 类型 AgentDefinition
    let existingDef = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByNameAndScope,
      {
        name: "term-discovery",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );

    if (!existingDef) {
      const defRow = await executeCommand(
        { db: drizzle },
        createAgentDefinition,
        {
          name: "term-discovery",
          description: "术语发现工作流",
          scopeType: "GLOBAL",
          scopeId: "",
          definitionId: "term-discovery",
          version: "1.0.0",
          type: "WORKFLOW",
          tools: [],
          content: "",
          isBuiltin: true,
        },
      );
      existingDef = await executeQuery(
        { db: drizzle },
        findAgentDefinitionByNameAndScope,
        {
          name: "term-discovery",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      );
      void defRow;
    }

    if (!existingDef) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to obtain term-discovery agent definition",
      });
    }

    const sessionResult = await executeCommand(
      { db: drizzle },
      createAgentSession,
      {
        agentDefinitionId: existingDef.externalId,
        userId: user.id,
        projectId: input.projectId,
      },
    );

    // Resolve internal session ID via domain query
    const sessionRow = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      { externalId: sessionResult.sessionId },
    );

    if (!sessionRow) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to resolve session",
      });
    }

    const projectDocuments =
      !input.documentIds?.length && !input.elementIds?.length
        ? await executeQuery({ db: drizzle }, listProjectDocuments, {
            projectId: input.projectId,
          })
        : [];
    const { projectId: _ignored, ...graphInput } = input;
    const hasElementIds = (graphInput.elementIds?.length ?? 0) > 0;
    const resolvedDocumentIds =
      (graphInput.documentIds?.length ?? 0) > 0 || hasElementIds
        ? graphInput.documentIds
        : projectDocuments
            .filter((document) => !document.isDirectory)
            .map((document) => document.id);

    const resolvedGraphInput = {
      ...graphInput,
      documentIds: resolvedDocumentIds,
    };

    if (!hasElementIds && (resolvedDocumentIds?.length ?? 0) === 0) {
      throw new ORPCError("BAD_REQUEST", {
        message: "No project documents available for term discovery",
      });
    }
    const runId = await runtime.scheduler.start(
      "term-discovery",
      resolvedGraphInput,
      {
        sessionId: sessionRow.id,
      },
    );

    return { runId };
  });

// ─── Workflow Runner — Term Alignment ────────────────────────────────────────

/** 启动术语对齐工作流，返回 runId */
export const startTermAlignment = authed
  .input(
    termAlignmentGraph.inputSchema.extend({
      /** 关联的项目 ID（用于在 WorkflowUI 中显示） */
      projectId: z.uuidv4(),
    }),
  )
  .output(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;

    const runtime = await getGraphRuntime(drizzle, pluginManager);

    // 找或创建 WORKFLOW 类型 AgentDefinition
    let existingAlignDef = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByNameAndScope,
      {
        name: "term-alignment",
        scopeType: "GLOBAL",
        scopeId: "",
        isBuiltin: true,
      },
    );

    if (!existingAlignDef) {
      const defRow = await executeCommand(
        { db: drizzle },
        createAgentDefinition,
        {
          name: "term-alignment",
          description: "术语对齐工作流",
          scopeType: "GLOBAL",
          scopeId: "",
          definitionId: "term-alignment",
          version: "1.0.0",
          type: "WORKFLOW",
          tools: [],
          content: "",
          isBuiltin: true,
        },
      );
      existingAlignDef = await executeQuery(
        { db: drizzle },
        findAgentDefinitionByNameAndScope,
        {
          name: "term-alignment",
          scopeType: "GLOBAL",
          scopeId: "",
          isBuiltin: true,
        },
      );
      void defRow;
    }

    if (!existingAlignDef) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to obtain term-alignment agent definition",
      });
    }

    const sessionResult = await executeCommand(
      { db: drizzle },
      createAgentSession,
      {
        agentDefinitionId: existingAlignDef.externalId,
        userId: user.id,
        projectId: input.projectId,
      },
    );

    // Resolve internal session ID via domain query
    const sessionRow = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      { externalId: sessionResult.sessionId },
    );

    if (!sessionRow) {
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Failed to resolve session",
      });
    }

    const { projectId: _ignored2, ...graphInput } = input;
    const runId = await runtime.scheduler.start("term-alignment", graphInput, {
      sessionId: sessionRow.id,
    });

    return { runId };
  });

// ─── Workflow Result Query ────────────────────────────────────────────────────

/** 查询术语工作流运行状态与结果 */
export const getTermWorkflowResult = authed
  .input(z.object({ runId: z.uuidv4() }))
  .output(
    z.object({
      status: z.enum([
        "running",
        "completed",
        "failed",
        "cancelled",
        "paused",
        "pending",
      ]),
      result: z.unknown().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const row = await executeQuery({ db: drizzle }, loadAgentRunMetadata, {
      externalId: input.runId,
    });

    if (!row) {
      throw new ORPCError("NOT_FOUND", { message: "Workflow run not found" });
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    const status = row.status as
      | "running"
      | "completed"
      | "failed"
      | "cancelled"
      | "paused"
      | "pending";

    return { status };
  });

export const glossaryRouter = {
  deleteTerm,
  get,
  getUserOwned,
  getProjectOwned,
  countTerm,
  create,
  insertTerm,
  searchTerm,
  findTerm,
  updateConcept,
  addTermToConcept,
  getConceptSubjects,
  startTermDiscovery,
  startTermAlignment,
  getTermWorkflowResult,
};
