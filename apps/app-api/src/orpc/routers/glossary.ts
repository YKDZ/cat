import {
  createTermGraph,
  runGraph,
  termAlignmentGraph,
  termDiscoveryGraph,
} from "@cat/agent/workflow";
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
import { streamSearchTermsOp } from "@cat/operations";
import { firstOrGivenService } from "@cat/server-shared";
import {
  TermStatusValues,
  TermTypeValues,
} from "@cat/shared/schema/drizzle/enum";
import { GlossarySchema } from "@cat/shared/schema/drizzle/glossary";
import { TermDataSchema } from "@cat/shared/schema/misc";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";
import { getGraphRuntime } from "@/utils/graph-runtime";

export const deleteTerm = authed
  .input(
    z.object({
      termId: z.int(),
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
    }),
  )
  .output(z.void())
  .handler(async ({ context, input }) => {
    const { pluginManager, user } = context;
    const { termsData, glossaryId } = input;

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

    const stream = streamSearchTermsOp({
      glossaryIds,
      text,
      sourceLanguageId: termLanguageId,
      translationLanguageId,
      minConfidence,
    });

    for await (const t of stream) {
      yield {
        term: t.term,
        translation: t.translation,
        definition: t.definition,
        confidence: t.confidence,
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

    const stream = streamSearchTermsOp({
      glossaryIds,
      text: element.value,
      sourceLanguageId: element.languageId,
      translationLanguageId,
      minConfidence,
    });

    for await (const t of stream) {
      yield {
        term: t.term,
        translation: t.translation,
        definition: t.definition,
        confidence: t.confidence,
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
    }),
  )
  .output(z.array(z.object({ id: z.int(), subject: z.string() })))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeQuery({ db: drizzle }, listGlossaryConceptSubjects, {
      glossaryId: input.glossaryId,
    });
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
          // oxlint-disable-next-line no-unsafe-type-assertion -- WORKFLOW agents don't need llm config
          definition: {
            id: "term-discovery",
            name: "术语发现",
            description: "术语发现工作流",
            version: "1.0.0",
            type: "WORKFLOW",
            systemPrompt: "",
            tools: [],
          } as Parameters<typeof createAgentDefinition>[1]["definition"],
          type: "WORKFLOW",
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
          // oxlint-disable-next-line no-unsafe-type-assertion -- WORKFLOW agents don't need llm config
          definition: {
            id: "term-alignment",
            name: "术语对齐",
            description: "术语对齐工作流",
            version: "1.0.0",
            type: "WORKFLOW",
            systemPrompt: "",
            tools: [],
          } as Parameters<typeof createAgentDefinition>[1]["definition"],
          type: "WORKFLOW",
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
