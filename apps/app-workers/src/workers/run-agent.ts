import {
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
} from "@cat/app-agent";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { getDrizzleDB } from "@cat/db";
import { PluginManager, type LLMProvider } from "@cat/plugin-core";
import * as z from "zod/v4";

import { defineTask } from "@/core";

// ─── Input / Output Schemas ───

export const RunAgentInputSchema = z.object({
  /** AgentSession external UUID */
  sessionExternalId: z.uuidv4(),
  /** User message to send */
  userMessage: z.string(),
});

export const RunAgentOutputSchema = z.object({
  finalMessage: z.string().nullable(),
  finishReason: z.enum([
    "completed",
    "max_steps",
    "error",
    "cancelled",
    "implicit_completion",
  ]),
  totalSteps: z.int(),
});

export type RunAgentInput = z.infer<typeof RunAgentInputSchema>;
export type RunAgentOutput = z.infer<typeof RunAgentOutputSchema>;

// ─── Task Definition ───

export const runAgentTask = await defineTask({
  name: "agent.run",
  input: RunAgentInputSchema,
  output: RunAgentOutputSchema,

  handler: async (data, ctx) => {
    const drizzleDB = await getDrizzleDB();
    const drizzle = drizzleDB.client;

    // 1. Resolve session + definition (no userId check for workers)
    const session = await resolveSession(drizzle, data.sessionExternalId);
    const definition = await resolveDefinition(
      drizzle,
      session.agentDefinitionId,
    );

    // 2. Resolve LLM provider
    const pluginManager = PluginManager.get("GLOBAL", "");
    const llmProvider = getServiceFromDBId<LLMProvider>(
      pluginManager,
      definition.llm.providerId,
    );

    // 3. Resolve tools (server-only, no client tools in worker)
    const tools = setupToolRegistry({
      definition,
      includeClientTools: false,
    });

    // 4. Load conversation history
    const { messages: existingMessages, toolCallsByMsgId } =
      await loadConversationHistory(drizzle, session.id);

    // 5. Build system prompt
    const systemPrompt = await buildSystemPrompt({
      drizzle,
      definition,
      sessionMetadata: session.metadata,
      userId: session.userId ?? "",
      tools,
    });

    // 6. Build chat messages
    const chatMessages = buildChatMessages({
      systemPrompt,
      existingMessages,
      toolCallsByMsgId,
      newUserMessage: data.userMessage,
    });

    // 7. Persist user message
    await persistUserMessage({
      drizzle,
      sessionId: session.id,
      systemPrompt,
      userMessage: data.userMessage,
      isFirstMessage: existingMessages.length === 0,
    });

    // 8. Execute agent
    const result = await runAgent({
      definition,
      messages: chatMessages,
      tools,
      llmProvider,
      sessionId: session.externalId,
      traceId: ctx.traceId,
    });

    // 9. Persist agent steps
    await persistAgentResult({
      drizzle,
      sessionId: session.id,
      steps: result.steps,
    });

    // 10. Update session status
    await updateSessionStatus({
      drizzle,
      sessionId: session.id,
      finishReason: result.finishReason,
    });

    return {
      finalMessage: result.finalMessage,
      finishReason: result.finishReason,
      totalSteps: result.steps.length,
    };
  },
});
