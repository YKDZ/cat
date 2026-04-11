import type { AgentRunMetadataRow } from "@cat/domain";
import type { JSONType } from "@cat/shared/schema/json";

import {
  createAgentDefinition,
  createAgentRun,
  createAgentSession,
  deleteAgentDefinition,
  executeCommand,
  executeQuery,
  findAgentDefinitionByDefinitionIdAndScope,
  getAgentDefinition,
  getAgentDefinitionByInternalId,
  getAgentRunByInternalId,
  getAgentRunInternalId,
  getAgentSessionByExternalId,
  getLatestCompletedRunBlackboard,
  getRunNodeEvents,
  listAgentDefinitions,
  listAgentEvents,
  listAgentSessions,
  listProjectRuns as queryListProjectRuns,
  loadAgentRunMetadata,
  loadAgentRunSnapshot,
  saveAgentRunSnapshot,
  updateAgentDefinition,
} from "@cat/domain";
import { AsyncMessageQueue, serverLogger } from "@cat/server-shared";
import {
  AgentConstraintsSchema,
  AgentDefinitionMetadataSchema,
  AgentLLMConfigSchema,
  AgentPromptConfigSchema,
  AgentSessionMetadataSchema,
  AgentSecurityPolicySchema,
  OrchestrationSchema,
} from "@cat/shared/schema/agent";
import { AgentDefinitionSchema } from "@cat/shared/schema/drizzle/agent";
import {
  AgentDefinitionTypeSchema,
  ScopeTypeSchema,
} from "@cat/shared/schema/enum";
import { createAgentEvent, type AgentEvent } from "@cat/workflow";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed, checkPermission } from "@/orpc/server";
import { createPreCheckServices } from "@/utils/agent-runtime-services";
import { createAgentToolRegistry } from "@/utils/agent-tool-registry";
import { getGraphRuntime } from "@/utils/graph-runtime";

const isTerminalRunEvent = (event: AgentEvent): boolean => {
  return event.type === "run:end" || event.type === "run:error";
};

const getSessionMetadata = (
  metadata: unknown,
): z.infer<typeof AgentSessionMetadataSchema> | null => {
  const parsed = AgentSessionMetadataSchema.safeParse(metadata);
  return parsed.success ? parsed.data : null;
};

const getProviderIdFromSessionMetadata = (metadata: unknown): number | null => {
  return getSessionMetadata(metadata)?.providerId ?? null;
};

const getAvailableLLMProviderIds = (
  services: Array<{ dbId: number }>,
): Set<number> => {
  return new Set(services.map((service) => service.dbId));
};

const normalizeAgentLLMConfig = (
  llmConfig: unknown,
  availableProviderIds: Set<number>,
): z.infer<typeof AgentLLMConfigSchema> | null => {
  const parsed = AgentLLMConfigSchema.safeParse(llmConfig);
  if (!parsed.success) return null;

  const normalized = { ...parsed.data };

  if (
    typeof normalized.providerId === "number" &&
    !availableProviderIds.has(normalized.providerId)
  ) {
    normalized.providerId = null;
  }

  if (
    typeof normalized.providerId !== "number" &&
    normalized.temperature === undefined &&
    normalized.maxTokens === undefined
  ) {
    return null;
  }

  return normalized;
};

const persistNormalizedAgentLLMConfig = async (
  db: Parameters<typeof executeCommand>[0]["db"],
  row: { externalId: string; llmConfig: unknown },
  normalizedLLMConfig: z.infer<typeof AgentLLMConfigSchema> | null,
): Promise<void> => {
  if (
    JSON.stringify(row.llmConfig ?? null) ===
    JSON.stringify(normalizedLLMConfig ?? null)
  ) {
    return;
  }

  await executeCommand({ db }, updateAgentDefinition, {
    id: row.externalId,
    llmConfig: normalizedLLMConfig,
  });
};

// ─── Routes ───

/** List all agent definitions visible to the current user */
export const list = authed
  .input(
    z.object({
      scopeType: ScopeTypeSchema.optional(),
      scopeId: z.string().optional(),
      type: AgentDefinitionTypeSchema.optional(),
    }),
  )
  .output(
    z.array(
      AgentDefinitionSchema.omit({ id: true }).extend({ id: z.uuidv4() }),
    ),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
      pluginManager,
    } = context;
    const rows = await executeQuery({ db }, listAgentDefinitions, input);
    const availableProviderIds = getAvailableLLMProviderIds(
      pluginManager.getServices("LLM_PROVIDER"),
    );

    return await Promise.all(
      rows.map(async (row) => {
        const llmConfig = normalizeAgentLLMConfig(
          row.llmConfig,
          availableProviderIds,
        );

        await persistNormalizedAgentLLMConfig(db, row, llmConfig);

        return {
          ...row,
          llmConfig,
          id: row.externalId,
        };
      }),
    );
  });

/** List agent definitions filtered by type */
export const getByType = authed
  .input(
    z.object({
      type: AgentDefinitionTypeSchema,
      scopeType: ScopeTypeSchema.optional(),
      scopeId: z.string().optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: db },
    } = context;
    const rows = await executeQuery({ db }, listAgentDefinitions, input);

    return rows.map((row) => ({
      id: row.externalId,
      name: row.name,
      description: row.description,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      isBuiltin: row.isBuiltin,
      type: row.type,
      definitionId: row.definitionId,
      version: row.version,
      icon: row.icon,
      content: row.content,
      createdAt: row.createdAt,
    }));
  });

/** Get a single agent definition */
export const get = authed
  .input(z.object({ id: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;
    const availableProviderIds = getAvailableLLMProviderIds(
      pluginManager.getServices("LLM_PROVIDER"),
    );

    const row = await executeQuery({ db: drizzle }, getAgentDefinition, input);

    if (!row)
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });

    const llmConfig = normalizeAgentLLMConfig(
      row.llmConfig,
      availableProviderIds,
    );

    await persistNormalizedAgentLLMConfig(drizzle, row, llmConfig);

    return {
      id: row.externalId,
      name: row.name,
      description: row.description,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      isBuiltin: row.isBuiltin,
      type: row.type,
      definitionId: row.definitionId,
      version: row.version,
      icon: row.icon,
      llmConfig,
      tools: row.tools,
      promptConfig: row.promptConfig,
      constraints: row.constraints,
      securityPolicy: row.securityPolicy,
      orchestration: row.orchestration,
      content: row.content,
      createdAt: row.createdAt,
    };
  });

/** Create a new agent definition */
export const create = authed
  .input(
    z.object({
      name: z.string().min(1),
      description: z.string().default(""),
      scopeType: ScopeTypeSchema.default("GLOBAL"),
      scopeId: z.string().default(""),
      // Metadata fields
      definitionId: z.string().default(""),
      version: z.string().default("1.0.0"),
      icon: z.string().optional(),
      type: AgentDefinitionMetadataSchema.shape.type,
      llmConfig: AgentLLMConfigSchema.optional(),
      tools: z.array(z.string()).default([]),
      promptConfig: AgentPromptConfigSchema.optional(),
      constraints: AgentConstraintsSchema.optional(),
      securityPolicy: AgentSecurityPolicySchema.optional(),
      orchestration: OrchestrationSchema.nullable().optional(),
      content: z.string().default(""),
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    return await executeCommand({ db: drizzle }, createAgentDefinition, {
      ...input,
      isBuiltin: false,
    });
  });

/** Update an existing agent definition */
export const update = authed
  .input(
    z.object({
      id: z.uuidv4(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      definitionId: z.string().optional(),
      version: z.string().optional(),
      icon: z.string().nullable().optional(),
      type: AgentDefinitionMetadataSchema.shape.type.optional(),
      llmConfig: AgentLLMConfigSchema.nullable().optional(),
      tools: z.array(z.string()).optional(),
      promptConfig: AgentPromptConfigSchema.nullable().optional(),
      constraints: AgentConstraintsSchema.nullable().optional(),
      securityPolicy: AgentSecurityPolicySchema.nullable().optional(),
      orchestration: OrchestrationSchema.nullable().optional(),
      content: z.string().optional(),
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    await executeCommand({ db: drizzle }, updateAgentDefinition, input);
  });

/** Delete an agent definition (cascades sessions) */
export const remove = authed
  .input(z.object({ id: z.uuidv4() }))
  .output(z.void())
  .use(checkPermission("system", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const row = await executeQuery({ db: drizzle }, getAgentDefinition, input);

    if (!row)
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });
    if (row.isBuiltin)
      throw new ORPCError("FORBIDDEN", {
        message: "Cannot delete built-in agent",
      });

    await executeCommand({ db: drizzle }, deleteAgentDefinition, {
      agentDefinitionId: row.id,
    });
  });

// ─── Session Management ───

/** Create a new agent session */
export const createSession = authed
  .input(
    z.object({
      agentDefinitionId: z.uuidv4(),
      projectId: z.uuidv4().optional(),
      metadata: AgentSessionMetadataSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const sessionResult = await executeCommand(
      { db: drizzle },
      createAgentSession,
      {
        metadata: {
          ...input.metadata,
          ...(input.projectId ? { projectId: input.projectId } : {}),
        },
        agentDefinitionId: input.agentDefinitionId,
        userId: user.id,
        projectId: input.projectId ?? input.metadata?.projectId,
      },
    );

    const { buildAgentDAG } = await import("@cat/agent");
    const graphDef = buildAgentDAG();

    const runResult = await executeCommand({ db: drizzle }, createAgentRun, {
      sessionId: sessionResult.sessionId,
      graphDefinition: graphDef,
    });

    return {
      sessionId: sessionResult.sessionId,
      runId: runResult.runId,
    };
  });

/** List sessions for the current user */
export const listSessions = authed
  .input(
    z
      .object({
        agentDefinitionId: z.uuidv4().optional(),
        limit: z.int().min(1).max(100).default(20),
        offset: z.int().min(0).default(0),
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const rows = await executeQuery({ db: drizzle }, listAgentSessions, {
      userId: user.id,
      agentDefinitionId: input?.agentDefinitionId,
      limit: input?.limit ?? 20,
      offset: input?.offset ?? 0,
    });

    return rows.map((row) => ({
      id: row.externalId,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  });

/** Get the hydrated state for an existing agent session */
export const getSessionState = authed
  .input(z.object({ sessionId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const session = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      {
        externalId: input.sessionId,
        userId: user.id,
      },
    );

    if (!session) {
      throw new ORPCError("NOT_FOUND", {
        message: "Agent session not found",
      });
    }

    const currentRun = session.currentRunId
      ? await executeQuery({ db: drizzle }, getAgentRunByInternalId, {
          id: session.currentRunId,
        })
      : null;

    const latestCompleted = currentRun?.blackboardSnapshot
      ? null
      : await executeQuery({ db: drizzle }, getLatestCompletedRunBlackboard, {
          sessionId: session.id,
        });

    return {
      sessionId: session.externalId,
      agentDefinitionId: session.agentDefinitionExternalId,
      status: session.status,
      metadata: session.metadata,
      runId: currentRun?.externalId ?? null,
      runStatus: currentRun?.status ?? null,
      blackboardSnapshot:
        currentRun?.blackboardSnapshot ??
        latestCompleted?.blackboardSnapshot ??
        null,
    };
  });

// ─── Agent Execution (Streaming) ───

/** Send a message to an agent session and stream the response */
export const sendMessage = authed
  .input(
    z.object({
      sessionId: z.uuidv4(),
      message: z.string().min(1),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
      user,
    } = context;

    // Verify session belongs to the requesting user
    const session = await executeQuery(
      { db: drizzle },
      getAgentSessionByExternalId,
      { externalId: input.sessionId, userId: user.id },
    );

    if (!session) {
      throw new ORPCError("NOT_FOUND", { message: "Agent session not found" });
    }

    // Lazy-load AgentRuntime and related classes
    const {
      AgentRuntime,
      LLMGateway,
      PromptEngine,
      createNoopAgentLogger,
      buildAgentDAG,
    } = await import("@cat/agent");

    // Build LLMGateway using the LLM provider configured for this agent definition
    const agentDef = await executeQuery(
      { db: drizzle },
      getAgentDefinitionByInternalId,
      { id: session.agentDefinitionId },
    );

    const llmServices = pluginManager.getServices("LLM_PROVIDER");
    const availableProviderIds = getAvailableLLMProviderIds(llmServices);
    const agentLLMConfig = normalizeAgentLLMConfig(
      agentDef?.llmConfig ?? null,
      availableProviderIds,
    );

    // Prefer the provider configured in the session; fall back to the agent definition; then first available
    const sessionProviderId = getProviderIdFromSessionMetadata(
      session.metadata,
    );
    const targetProviderId =
      sessionProviderId ?? agentLLMConfig?.providerId ?? null;
    let llmProvider;
    if (targetProviderId) {
      const found = llmServices.find((s) => s.dbId === targetProviderId);
      if (!found) {
        serverLogger.warn(
          `LLM Provider ${targetProviderId} not found, falling back to first available`,
        );
      }
      llmProvider = found?.service ?? llmServices[0]?.service;
    } else {
      llmProvider = llmServices[0]?.service;
    }

    if (!llmProvider) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message:
          "No LLM provider configured. Install an LLM provider plugin first.",
      });
    }

    const gateway = new LLMGateway({ provider: llmProvider });
    const toolRegistry = createAgentToolRegistry(pluginManager);
    const promptEngine = new PromptEngine();

    const runtime = new AgentRuntime({
      llmGateway: gateway,
      toolRegistry,
      promptEngine,
      logger: createNoopAgentLogger(),
      preCheckServices: createPreCheckServices(drizzle),
    });

    // Create a new run for this message turn
    const graphDef = buildAgentDAG();
    const runResult = await executeCommand({ db: drizzle }, createAgentRun, {
      sessionId: input.sessionId,
      graphDefinition: graphDef,
    });

    // Persist the user message into the blackboard so the runtime has context
    await executeCommand({ db: drizzle }, saveAgentRunSnapshot, {
      externalId: runResult.runId,
      snapshot: {
        messages: [{ role: "user", content: input.message }],
        started_at: new Date().toISOString(),
        current_turn: 0,
      },
    });

    // Map Agent node types to workflow node types for event wrapping
    const agentToWorkflowNodeType = (
      nodeType: "precheck" | "reasoning" | "tool" | "decision",
    ) => {
      switch (nodeType) {
        case "precheck":
          return "transform" as const;
        case "reasoning":
          return "llm" as const;
        case "tool":
          return "tool" as const;
        case "decision":
          return "router" as const;
      }
    };

    // Track final state to include the assistant response in run:end
    let finishReason: string | null = null;
    let hadError = false;

    // Stream events from the DAG loop, mapping to valid workflow event types
    for await (const event of runtime.runLoop(
      input.sessionId,
      runResult.runId,
    )) {
      const base = {
        runId: runResult.runId,
        timestamp: new Date().toISOString(),
      } as const;
      if (event.type === "started") {
        yield createAgentEvent({
          ...base,
          type: "run:start",
          payload: { graphId: event.sessionId, input: {} },
        });
      } else if (event.type === "node") {
        if (event.status === "started") {
          yield createAgentEvent({
            ...base,
            type: "node:start",
            payload: {
              nodeType: agentToWorkflowNodeType(event.nodeType),
              config: {},
            },
          });
        } else if (event.status === "failed") {
          yield createAgentEvent({
            ...base,
            type: "node:error",
            payload: { error: "agent node failed" },
          });
        } else {
          yield createAgentEvent({
            ...base,
            type: "node:end",
            payload: {
              status: "completed",
              output: null,
              patch: null,
              pauseReason: null,
              nodeType: agentToWorkflowNodeType(event.nodeType),
            },
          });
        }
      } else if (event.type === "tool_call") {
        yield createAgentEvent({
          ...base,
          type: "tool:call",
          payload: {
            toolName: event.toolName,
            toolCallId: event.toolCallId,
          },
        });
      } else if (event.type === "tool_result") {
        yield createAgentEvent({
          ...base,
          type: "tool:result",
          payload: {
            toolCallId: event.toolCallId,
            content: event.content,
          },
        });
      } else if (event.type === "llm_thinking") {
        yield createAgentEvent({
          ...base,
          type: "llm:thinking",
          payload: { thinkingDelta: event.thinkingDelta },
        });
      } else if (event.type === "llm_complete") {
        yield createAgentEvent({
          ...base,
          type: "llm:complete",
          payload: {
            text: event.text,
            thinkingText: event.thinkingText,
            tokenUsage: event.tokenUsage,
          },
        });
      } else if (event.type === "finished") {
        finishReason = event.reason;
      } else if (event.type === "failed") {
        hadError = true;
        yield createAgentEvent({
          ...base,
          type: "run:error",
          payload: { error: event.error.message },
        });
      }
    }

    // If the runtime already emitted a run:error, do not send run:end
    // which would overwrite the frontend error state.
    if (hadError) {
      return;
    }

    // After the loop: load the final blackboard snapshot to extract the assistant message
    const finalSnapshot = await executeQuery(
      { db: drizzle },
      loadAgentRunSnapshot,
      { externalId: runResult.runId },
    );

    // Extract the last assistant message from the blackboard
    // The snapshot is the AgentBlackboardData directly (messages at top level)
    let finalMessage: string | null = null;
    if (
      finalSnapshot &&
      typeof finalSnapshot === "object" &&
      !Array.isArray(finalSnapshot)
    ) {
      const snapshotObj = finalSnapshot;
      const msgs = snapshotObj["messages"];
      if (Array.isArray(msgs) && msgs.length > 0) {
        const lastMsg = msgs[msgs.length - 1];
        if (
          lastMsg &&
          typeof lastMsg === "object" &&
          !Array.isArray(lastMsg) &&
          "role" in lastMsg &&
          "content" in lastMsg
        ) {
          const { role, content } = lastMsg;
          if (role === "assistant" && typeof content === "string") {
            finalMessage = content;
          }
        }
      }
    }

    yield createAgentEvent({
      runId: runResult.runId,
      timestamp: new Date().toISOString(),
      type: "run:end",
      payload: {
        status: finishReason ?? "completed",
        finalMessage,
      },
    });
  });

// ─── Graph Runtime Control ───

export const graphStart = authed
  .input(
    z.object({
      graphId: z.string().min(1),
      input: z.record(z.string(), z.unknown()).default({}),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const graphRuntime = await getGraphRuntime(drizzle, context.pluginManager);
    const runId = await graphRuntime.scheduler.start(
      input.graphId,
      input.input,
    );
    return { runId };
  });

export const graphPause = authed
  .input(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const graphRuntime = await getGraphRuntime(drizzle, context.pluginManager);
    await graphRuntime.scheduler.pause(input.runId);
    return { ok: true };
  });

export const graphResume = authed
  .input(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const graphRuntime = await getGraphRuntime(drizzle, context.pluginManager);
    await graphRuntime.scheduler.recover(input.runId, {
      runtime: { pluginManager: context.pluginManager },
    });
    await graphRuntime.scheduler.resume(input.runId);
    return { ok: true };
  });

export const graphCancel = authed
  .input(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const graphRuntime = await getGraphRuntime(drizzle, context.pluginManager);
    await graphRuntime.eventBus.publish(
      createAgentEvent({
        runId: input.runId,
        type: "run:cancel",
        timestamp: new Date().toISOString(),
        payload: {},
      }),
    );
    return { ok: true };
  });

export const graphStatus = authed
  .input(z.object({ runId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const graphRuntime = await getGraphRuntime(drizzle, context.pluginManager);
    const metadata = await graphRuntime.checkpointer.loadRunMetadata(
      input.runId,
    );
    const snapshot = await graphRuntime.checkpointer.loadSnapshot(input.runId);
    return {
      metadata,
      snapshot,
    };
  });

export const graphEvents = authed
  .input(
    z.object({
      runId: z.uuidv4(),
      includeHistory: z.boolean().default(true),
    }),
  )
  .handler(async function* ({ context, input }) {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const graphRuntime = await getGraphRuntime(drizzle, context.pluginManager);
    const queue = new AsyncMessageQueue<AgentEvent>();
    const bufferedEvents: AgentEvent[] = [];
    const seenEventIds = new Set<string>();
    let replayingHistory = input.includeHistory;

    const pushEvent = (event: AgentEvent) => {
      if (seenEventIds.has(event.eventId)) return;
      seenEventIds.add(event.eventId);
      queue.push(event);
      if (isTerminalRunEvent(event)) {
        queue.close();
      }
    };

    const unsubscribe = graphRuntime.eventBus.subscribeAll((event) => {
      if (event.runId !== input.runId) return;
      if (replayingHistory) {
        bufferedEvents.push(event);
        return;
      }

      pushEvent(event);
    });

    if (input.includeHistory) {
      const history = await graphRuntime.checkpointer.listEvents(input.runId);
      for (const event of history) {
        pushEvent(event);
      }
    }

    replayingHistory = false;
    for (const event of bufferedEvents) {
      pushEvent(event);
      if (isTerminalRunEvent(event)) {
        break;
      }
    }

    const metadata = await graphRuntime.checkpointer.loadRunMetadata(
      input.runId,
    );
    if (
      metadata &&
      (metadata.status === "completed" ||
        metadata.status === "failed" ||
        metadata.status === "cancelled")
    ) {
      queue.close();
    }

    try {
      for await (const event of queue.consume()) {
        yield event;
      }
    } finally {
      unsubscribe();
      queue.clear();
    }
  });

// ─── Tool Confirm Callback ───

export const submitToolConfirmResponse = authed
  .input(
    z.object({
      runId: z.uuidv4(),
      nodeId: z.string().optional(),
      response: z.unknown(),
    }),
  )
  .handler(async () => {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message: "TODO: Agent 重构后需要重新实现",
    });
  });

// ─── Builtin Template Management ───

/** Return all builtin agent templates stored in the database */
export const listBuiltinTemplates = authed.handler(async ({ context }) => {
  const {
    drizzleDB: { client: drizzle },
  } = context;

  const defs = await executeQuery({ db: drizzle }, listAgentDefinitions, {
    isBuiltin: true,
    scopeType: "GLOBAL",
    scopeId: "",
  });

  return defs.map((d) => ({
    templateId: d.definitionId,
    name: d.name,
    description: d.description,
    icon: d.icon ?? "",
    tools: d.tools,
  }));
});

/** List available LLM_PROVIDER plugin services the user can choose from */
export const listLLMProviders = authed.handler(async ({ context }) => {
  const { pluginManager } = context;

  return pluginManager.getServices("LLM_PROVIDER").map((s) => ({
    id: s.dbId,
    serviceId: s.id,
    name: s.service.getModelName(),
  }));
});

/**
 * Enable a builtin agent template by materialising it into the database.
 */
export const enableBuiltin = authed
  .input(
    z.object({
      templateId: z.string().min(1),
      providerId: z.int().optional(),
      scopeType: ScopeTypeSchema.default("PROJECT"),
      scopeId: z.string().default(""),
    }),
  )
  .use(checkPermission("system", "admin"), () => "*")
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;
    const llmServices = pluginManager.getServices("LLM_PROVIDER");
    const availableProviderIds = getAvailableLLMProviderIds(llmServices);

    if (
      typeof input.providerId === "number" &&
      !availableProviderIds.has(input.providerId)
    ) {
      throw new ORPCError("PRECONDITION_FAILED", {
        message: "Selected LLM provider not found",
      });
    }

    const template = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByDefinitionIdAndScope,
      {
        definitionId: input.templateId,
        scopeType: "GLOBAL",
        scopeId: "",
      },
    );

    if (!template || !template.isBuiltin) {
      throw new ORPCError("NOT_FOUND", {
        message: "Builtin template not found",
      });
    }

    const existing = await executeQuery(
      { db: drizzle },
      findAgentDefinitionByDefinitionIdAndScope,
      {
        definitionId: input.templateId,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
      },
    );

    if (existing) {
      return {
        id: existing.externalId,
        templateId: existing.definitionId,
        scopeType: existing.scopeType,
        scopeId: existing.scopeId,
      };
    }

    const templateLLMConfig = normalizeAgentLLMConfig(
      template.llmConfig,
      availableProviderIds,
    );
    const nextLLMConfig = normalizeAgentLLMConfig(
      {
        ...(templateLLMConfig ?? {}),
        ...(typeof input.providerId === "number"
          ? { providerId: input.providerId }
          : {}),
      },
      availableProviderIds,
    );

    const created = await executeCommand(
      { db: drizzle },
      createAgentDefinition,
      {
        name: template.name,
        description: template.description,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        definitionId: template.definitionId,
        version: template.version,
        icon: template.icon ?? undefined,
        type: template.type,
        llmConfig: nextLLMConfig ?? undefined,
        tools: template.tools,
        promptConfig: template.promptConfig ?? undefined,
        constraints: template.constraints ?? undefined,
        securityPolicy: template.securityPolicy ?? undefined,
        orchestration: template.orchestration ?? undefined,
        content: template.content,
        isBuiltin: true,
      },
    );

    return {
      id: created.id,
      templateId: template.definitionId,
      scopeType: input.scopeType,
      scopeId: input.scopeId,
    };
  });

/**
 * Disable (remove) a previously enabled builtin agent from the database.
 */
export const disableBuiltin = authed
  .input(z.object({ id: z.uuidv4() }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const row = await executeQuery({ db: drizzle }, getAgentDefinition, {
      id: input.id,
    });

    if (!row) {
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });
    }

    if (!row.isBuiltin || row.scopeType === "GLOBAL") {
      throw new ORPCError("FORBIDDEN", {
        message: "Only project/user builtin instances can be disabled",
      });
    }

    await executeCommand({ db: drizzle }, deleteAgentDefinition, {
      agentDefinitionId: row.id,
    });
  });

// ─── Workflow / Graph Run Queries ───

/** List agent runs associated with a project */
export const listProjectRuns = authed
  .input(
    z.object({
      projectId: z.uuidv4(),
      status: z
        .enum([
          "pending",
          "running",
          "paused",
          "completed",
          "failed",
          "cancelled",
        ])
        .optional(),
      limit: z.int().min(1).max(100).default(20),
      offset: z.int().nonnegative().default(0),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const rows = await executeQuery(
      { db: drizzle },
      queryListProjectRuns,
      input,
    );

    return rows.map((row) => ({
      id: row.externalId,
      sessionId: row.sessionExternalId,
      status: row.status,
      graphDefinition: row.graphDefinition,
      currentNodeId: row.currentNodeId,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      metadata: row.metadata,
    }));
  });

/** Get graph definition + current node statuses derived from events */
export const getRunGraph = authed
  .input(z.object({ runId: z.uuidv4() }))
  .output(
    z.object({
      metadata: z.custom<AgentRunMetadataRow>().nullable(),
      nodeStatuses: z.record(z.string(), z.string()),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const metadata = await executeQuery({ db: drizzle }, loadAgentRunMetadata, {
      externalId: input.runId,
    });

    if (!metadata)
      throw new ORPCError("NOT_FOUND", { message: "Run not found" });

    const internalId = await executeQuery(
      { db: drizzle },
      getAgentRunInternalId,
      { externalId: input.runId },
    );

    const nodeStatuses: Record<string, string> = {};

    if (internalId) {
      const events = await executeQuery({ db: drizzle }, listAgentEvents, {
        runInternalId: internalId,
      });

      for (const event of events) {
        if (!event.nodeId) continue;
        if (event.type === "node:start") {
          nodeStatuses[event.nodeId] = "running";
        } else if (event.type === "node:end") {
          nodeStatuses[event.nodeId] = "completed";
        } else if (event.type === "node:error") {
          nodeStatuses[event.nodeId] = "error";
        }
      }
    }

    return {
      metadata,
      nodeStatuses,
    };
  });

/** Get all events for a specific node in a run */
export const getNodeDetail = authed
  .input(
    z.object({
      runId: z.uuidv4(),
      nodeId: z.string().min(1),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const events = await executeQuery({ db: drizzle }, getRunNodeEvents, {
      runExternalId: input.runId,
      nodeId: input.nodeId,
    });

    let status = "pending";
    let nodeInput: JSONType | undefined = undefined;
    let nodeOutput: JSONType | undefined = undefined;
    let nodeError: JSONType | undefined = undefined;

    const getPayloadProp = (
      payload: JSONType,
      key: string,
    ): JSONType | undefined => {
      if (
        typeof payload === "object" &&
        payload !== null &&
        !Array.isArray(payload)
      ) {
        return payload[key];
      }
      return undefined;
    };

    for (const event of events) {
      if (event.type === "node:start") {
        status = "running";
        nodeInput = getPayloadProp(event.payload, "input");
      } else if (event.type === "node:end") {
        status = "completed";
        nodeOutput = getPayloadProp(event.payload, "output");
      } else if (event.type === "node:error") {
        status = "error";
        nodeError = getPayloadProp(event.payload, "error");
      }
    }

    return {
      nodeId: input.nodeId,
      status,
      input: nodeInput,
      output: nodeOutput,
      error: nodeError,
      events,
    };
  });

/** Retry a failed node by resuming the run from that node */
export const retryNode = authed
  .input(
    z.object({
      runId: z.uuidv4(),
      nodeId: z.string().min(1),
    }),
  )
  .handler(async () => {
    throw new ORPCError("NOT_IMPLEMENTED", {
      message:
        "TODO: Scheduler 不支持按节点重试，需扩展 recover/resume 接口后重新实现",
    });
  });
