import type { LLMProvider } from "@cat/plugin-core";
import type {
  ToolConfirmRequest,
  ToolExecuteRequest,
} from "@cat/shared/schema/agent";
import type { JSONType } from "@cat/shared/schema/json";

import {
  AgentDefinitionSchema,
  AgentSessionMetaSchema,
  buildChatMessages,
  buildSystemPrompt,
  loadConversationHistory,
  persistAgentResult,
  persistUserMessage,
  resolveDefinition,
  resolveSession,
  runAgent,
  setupToolRegistry,
  updateSessionStatus,
  type AgentStep,
} from "@cat/app-agent";
import {
  AsyncMessageQueue,
  builtinAgentTemplates,
  getBuiltinAgentTemplate,
  getServiceFromDBId,
} from "@cat/app-server-shared/utils";
import {
  agentDefinition,
  agentMessage,
  agentSession,
  and,
  desc,
  eq,
  getColumns,
} from "@cat/db";
import {
  ToolConfirmResponseSchema,
  ToolExecuteResponseSchema,
} from "@cat/shared/schema/agent";
import { ScopeTypeSchema } from "@cat/shared/schema/drizzle/enum";
import { logger } from "@cat/shared/utils";
import { ORPCError } from "@orpc/client";
import * as z from "zod/v4";

import { authed } from "@/orpc/server";
import {
  clearSessionManagers,
  getSessionManagers,
} from "@/utils/agent-session-managers";

// ─── Routes ───

/** List all agent definitions visible to the current user */
export const list = authed
  .input(
    z
      .object({
        scopeType: ScopeTypeSchema.optional(),
        scopeId: z.string().optional(),
      })
      .optional(),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const conditions = [];
    if (input?.scopeType) {
      conditions.push(eq(agentDefinition.scopeType, input.scopeType));
    }
    if (input?.scopeId) {
      conditions.push(eq(agentDefinition.scopeId, input.scopeId));
    }

    const rows = await drizzle
      .select({
        ...getColumns(agentDefinition),
      })
      .from(agentDefinition)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(agentDefinition.createdAt));

    return rows.map((row) => ({
      id: row.externalId,
      name: row.name,
      description: row.description,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      isBuiltin: row.isBuiltin,
      definition: row.definition,
      createdAt: row.createdAt,
    }));
  });

/** Get a single agent definition */
export const get = authed
  .input(z.object({ id: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const [row] = await drizzle
      .select({ ...getColumns(agentDefinition) })
      .from(agentDefinition)
      .where(eq(agentDefinition.externalId, input.id))
      .limit(1);

    if (!row)
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });

    return {
      id: row.externalId,
      name: row.name,
      description: row.description,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      isBuiltin: row.isBuiltin,
      definition: row.definition,
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
      definition: AgentDefinitionSchema,
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const [row] = await drizzle
      .insert(agentDefinition)
      .values({
        name: input.name,
        description: input.description,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        // oxlint-disable-next-line no-unsafe-type-assertion -- Zod-validated definition is JSON-compatible
        definition: input.definition as unknown as JSONType,
        isBuiltin: false,
      })
      .returning({ externalId: agentDefinition.externalId });

    if (!row)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Insert failed",
      });
    return { id: row.externalId };
  });

/** Update an existing agent definition */
export const update = authed
  .input(
    z.object({
      id: z.uuidv4(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      definition: AgentDefinitionSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const values: Record<string, unknown> = {};
    if (input.name !== undefined) values["name"] = input.name;
    if (input.description !== undefined)
      values["description"] = input.description;
    if (input.definition !== undefined) values["definition"] = input.definition;

    if (Object.keys(values).length === 0) return;

    await drizzle
      .update(agentDefinition)
      .set(values)
      .where(eq(agentDefinition.externalId, input.id));
  });

/** Delete an agent definition (cascades sessions) */
export const remove = authed
  .input(z.object({ id: z.uuidv4() }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const [row] = await drizzle
      .select({ id: agentDefinition.id, isBuiltin: agentDefinition.isBuiltin })
      .from(agentDefinition)
      .where(eq(agentDefinition.externalId, input.id))
      .limit(1);

    if (!row)
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });
    if (row.isBuiltin)
      throw new ORPCError("FORBIDDEN", {
        message: "Cannot delete built-in agent",
      });

    await drizzle.delete(agentDefinition).where(eq(agentDefinition.id, row.id));
  });

// ─── Session Management ───

/** Create a new agent session */
export const createSession = authed
  .input(
    z.object({
      agentDefinitionId: z.uuidv4(),
      metadata: AgentSessionMetaSchema.optional(),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      user,
    } = context;

    const [def] = await drizzle
      .select({ id: agentDefinition.id })
      .from(agentDefinition)
      .where(eq(agentDefinition.externalId, input.agentDefinitionId))
      .limit(1);

    if (!def)
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });

    const [session] = await drizzle
      .insert(agentSession)
      .values({
        agentDefinitionId: def.id,
        userId: user.id,
        // oxlint-disable-next-line no-unsafe-type-assertion -- metadata shape is validated by Zod
        metadata: (input.metadata ?? {}) as JSONType,
      })
      .returning({
        externalId: agentSession.externalId,
      });

    if (!session)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Insert failed",
      });
    return { sessionId: session.externalId };
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

    const conditions = [eq(agentSession.userId, user.id)];
    if (input?.agentDefinitionId) {
      const [def] = await drizzle
        .select({ id: agentDefinition.id })
        .from(agentDefinition)
        .where(eq(agentDefinition.externalId, input.agentDefinitionId))
        .limit(1);
      if (def) {
        conditions.push(eq(agentSession.agentDefinitionId, def.id));
      }
    }

    const rows = await drizzle
      .select({ ...getColumns(agentSession) })
      .from(agentSession)
      .where(and(...conditions))
      .orderBy(desc(agentSession.createdAt))
      .limit(input?.limit ?? 20)
      .offset(input?.offset ?? 0);

    return rows.map((row) => ({
      id: row.externalId,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  });

/** Get session messages history */
export const getSessionMessages = authed
  .input(z.object({ sessionId: z.uuidv4() }))
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const [session] = await drizzle
      .select({ id: agentSession.id })
      .from(agentSession)
      .where(eq(agentSession.externalId, input.sessionId))
      .limit(1);

    if (!session)
      throw new ORPCError("NOT_FOUND", { message: "Session not found" });

    const messages = await drizzle
      .select({ ...getColumns(agentMessage) })
      .from(agentMessage)
      .where(eq(agentMessage.sessionId, session.id))
      .orderBy(agentMessage.createdAt);

    return messages.map((m) => ({
      role: m.role,
      content: m.content,
      toolCallId: m.toolCallId,
      stepIndex: m.stepIndex,
      createdAt: m.createdAt,
    }));
  });

// ─── Agent Execution (Streaming) ───

type StreamChunk =
  | { type: "step"; step: AgentStep }
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | { type: "tool_confirm_request"; request: ToolConfirmRequest }
  | { type: "tool_execute_request"; request: ToolExecuteRequest }
  | {
      type: "done";
      result: {
        finalMessage: string | null;
        finishReason: string;
        totalSteps: number;
      };
    }
  | {
      /**
       * Emitted when the engine injects a correction prompt because the LLM
       * produced plain text instead of calling the finish tool. The frontend
       * should reset streaming accumulators so the retry streams cleanly.
       */
      type: "correction_retry";
    }
  | { type: "error"; message: string };

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

    // 1. Resolve session + definition
    const session = await resolveSession(drizzle, input.sessionId, user.id);
    const definition = await resolveDefinition(
      drizzle,
      session.agentDefinitionId,
    );

    // 2. Resolve LLM provider
    const llmProvider = getServiceFromDBId<LLMProvider>(
      pluginManager,
      definition.llm.providerId,
    );

    // 3. Resolve tools (server + client)
    const tools = setupToolRegistry({
      definition,
      includeClientTools: true,
    });

    // 4. Load conversation history
    const { messages: existingMessages, toolCallsByMsgId } =
      await loadConversationHistory(drizzle, session.id);

    // 5. Build system prompt
    const systemPrompt = await buildSystemPrompt({
      drizzle,
      definition,
      sessionMetadata: session.metadata,
      userId: session.userId ?? user.id,
      tools,
    });

    // 6. Build chat messages
    const chatMessages = buildChatMessages({
      systemPrompt,
      existingMessages,
      toolCallsByMsgId,
      newUserMessage: input.message,
    });

    // 7. Persist user message
    await persistUserMessage({
      drizzle,
      sessionId: session.id,
      systemPrompt,
      userMessage: input.message,
      isFirstMessage: existingMessages.length === 0,
    });

    // 8. Run agent with streaming
    const traceId = crypto.randomUUID();
    const queue = new AsyncMessageQueue<StreamChunk>();
    const managers = getSessionManagers(session.externalId);

    const runPromise = runAgent({
      definition,
      messages: chatMessages,
      tools,
      llmProvider,
      sessionId: session.externalId,
      traceId,
      onStep: (step) => {
        queue.push({ type: "step", step });
      },
      onChunk: (chunk) => {
        if (chunk.type === "text_delta") {
          queue.push({ type: "text_delta", text: chunk.textDelta });
        } else if (chunk.type === "thinking_delta") {
          queue.push({ type: "thinking_delta", text: chunk.thinkingDelta });
        }
      },
      onToolConfirmRequest: async (request) => {
        queue.push({ type: "tool_confirm_request", request });
        return managers.confirmations.wait(request.callId);
      },
      onToolExecuteRequest: async (request) => {
        queue.push({ type: "tool_execute_request", request });
        return managers.executions.wait(request.callId);
      },
      onCorrectionRetry: () => {
        queue.push({ type: "correction_retry" });
      },
    });

    // Process results in background
    void runPromise
      .then(async (result) => {
        await persistAgentResult({
          drizzle,
          sessionId: session.id,
          steps: result.steps,
        });

        await updateSessionStatus({
          drizzle,
          sessionId: session.id,
          finishReason: result.finishReason,
        });

        queue.push({
          type: "done",
          result: {
            finalMessage: result.finalMessage,
            finishReason: result.finishReason,
            totalSteps: result.steps.length,
          },
        });
        queue.close();
        clearSessionManagers(session.externalId);
      })
      .catch((err: unknown) => {
        logger.error("AGENT", { msg: "Agent execution failed", traceId }, err);
        queue.push({
          type: "error",
          message: err instanceof Error ? err.message : "Unknown error",
        });
        queue.close();
        clearSessionManagers(session.externalId);

        // Mark session as failed
        void updateSessionStatus({
          drizzle,
          sessionId: session.id,
          finishReason: "error",
        });
      });

    // 9. Stream results
    try {
      for await (const chunk of queue.consume()) {
        yield chunk;
      }
    } finally {
      queue.clear();
      clearSessionManagers(session.externalId);
    }
  });

// ─── Tool Confirm / Execute Callbacks ───

/**
 * Submit the user's confirmation decision for a pending tool call.
 * Called by the frontend via WebSocket after receiving a `tool_confirm_request` chunk.
 */
export const submitToolConfirmResponse = authed
  .input(
    z.object({
      sessionId: z.uuidv4(),
      response: ToolConfirmResponseSchema,
    }),
  )
  .handler(async ({ input }) => {
    const managers = getSessionManagers(input.sessionId);
    const resolved = managers.confirmations.resolve(
      input.response.callId,
      input.response,
    );
    if (!resolved) {
      throw new ORPCError("NOT_FOUND", {
        message: `No pending confirmation for call "${input.response.callId}"`,
      });
    }
    return { ok: true };
  });

/**
 * Submit the result of a client-side tool execution.
 * Called by the frontend via WebSocket after executing a client tool locally.
 */
export const submitToolExecuteResult = authed
  .input(
    z.object({
      sessionId: z.uuidv4(),
      response: ToolExecuteResponseSchema,
    }),
  )
  .handler(async ({ input }) => {
    const managers = getSessionManagers(input.sessionId);
    const resolved = managers.executions.resolve(
      input.response.callId,
      input.response,
    );
    if (!resolved) {
      throw new ORPCError("NOT_FOUND", {
        message: `No pending execution for call "${input.response.callId}"`,
      });
    }
    return { ok: true };
  });

// ─── Builtin Template Management ───

/** Return all in-memory builtin agent templates (never touches DB) */
export const listBuiltinTemplates = authed.handler(async () =>
  builtinAgentTemplates.map((t) => ({
    templateId: t.templateId,
    name: t.name,
    description: t.description,
    icon: t.icon,
    tools: t.definition.tools,
  })),
);

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
 * The caller must supply a valid `providerId` referencing an installed
 * LLM_PROVIDER service, ensuring the agent can actually run.
 */
export const enableBuiltin = authed
  .input(
    z.object({
      templateId: z.string().min(1),
      providerId: z.int(),
      scopeType: ScopeTypeSchema.default("PROJECT"),
      scopeId: z.string().default(""),
    }),
  )
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
      pluginManager,
    } = context;

    // 1. Validate template exists
    const template = getBuiltinAgentTemplate(input.templateId);
    if (!template)
      throw new ORPCError("NOT_FOUND", {
        message: `Builtin template "${input.templateId}" not found`,
      });

    // 2. Validate LLM provider exists in the runtime registry
    const providerService = pluginManager
      .getAllServices()
      .find((s) => s.dbId === input.providerId && s.type === "LLM_PROVIDER");

    if (!providerService)
      throw new ORPCError("BAD_REQUEST", {
        message: `LLM provider with DB id ${input.providerId} is not available`,
      });

    // 3. Check not already enabled for this scope
    const existing = await drizzle
      .select({ id: agentDefinition.id })
      .from(agentDefinition)
      .where(
        and(
          eq(agentDefinition.isBuiltin, true),
          eq(agentDefinition.name, template.name),
          eq(agentDefinition.scopeType, input.scopeType),
          eq(agentDefinition.scopeId, input.scopeId),
        ),
      )
      .limit(1);

    if (existing.length > 0)
      throw new ORPCError("CONFLICT", {
        message: `"${template.name}" is already enabled for this scope`,
      });

    // 4. Merge providerId into the template definition
    const fullDefinition = {
      ...template.definition,
      llm: {
        ...template.definition.llm,
        providerId: input.providerId,
      },
    };

    // 5. Insert into DB
    const [row] = await drizzle
      .insert(agentDefinition)
      .values({
        name: template.name,
        description: template.description,
        scopeType: input.scopeType,
        scopeId: input.scopeId,
        // oxlint-disable-next-line no-unsafe-type-assertion -- Template definition is a known JSON-compatible object
        definition: fullDefinition as unknown as JSONType,
        isBuiltin: true,
      })
      .returning({ externalId: agentDefinition.externalId });

    if (!row)
      throw new ORPCError("INTERNAL_SERVER_ERROR", {
        message: "Insert failed",
      });

    return { id: row.externalId };
  });

/**
 * Disable (remove) a previously enabled builtin agent from the database.
 * Only builtin agents can be disabled via this endpoint.
 */
export const disableBuiltin = authed
  .input(z.object({ id: z.uuidv4() }))
  .output(z.void())
  .handler(async ({ context, input }) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;

    const [row] = await drizzle
      .select({ id: agentDefinition.id, isBuiltin: agentDefinition.isBuiltin })
      .from(agentDefinition)
      .where(eq(agentDefinition.externalId, input.id))
      .limit(1);

    if (!row)
      throw new ORPCError("NOT_FOUND", {
        message: "Agent definition not found",
      });

    if (!row.isBuiltin)
      throw new ORPCError("BAD_REQUEST", {
        message: "Only builtin agents can be disabled via this endpoint",
      });

    await drizzle.delete(agentDefinition).where(eq(agentDefinition.id, row.id));
  });
