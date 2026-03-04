import type { JSONType } from "@cat/shared/schema/json";

import {
  agentMessage,
  agentSession,
  agentToolCall,
  eq,
  type DrizzleClient,
} from "@cat/db";

import type { AgentStep, ToolCallRecord } from "@/engine/types";

// ─── Constants ───

const CONFIRMATION_STATUS_TO_ENUM = {
  auto_allowed: "AUTO_ALLOWED",
  user_approved: "USER_APPROVED",
  user_denied: "USER_DENIED",
} as const;

// ─── Persist User Message ───

/**
 * Persist the user's message (and system prompt on first interaction) to the DB.
 */
export const persistUserMessage = async (params: {
  drizzle: DrizzleClient;
  sessionId: number;
  systemPrompt: string;
  userMessage: string;
  isFirstMessage: boolean;
}): Promise<void> => {
  const { drizzle, sessionId, systemPrompt, userMessage, isFirstMessage } =
    params;

  const messagesToInsert: Array<{
    sessionId: number;
    role: "SYSTEM" | "USER" | "ASSISTANT" | "TOOL";
    content: string | null;
    toolCallId: string | null;
    stepIndex: number | null;
  }> = [];

  if (isFirstMessage) {
    messagesToInsert.push({
      sessionId,
      role: "SYSTEM",
      content: systemPrompt,
      toolCallId: null,
      stepIndex: null,
    });
  }

  messagesToInsert.push({
    sessionId,
    role: "USER",
    content: userMessage,
    toolCallId: null,
    stepIndex: null,
  });

  await drizzle.insert(agentMessage).values(messagesToInsert);
};

// ─── Persist Agent Result ───

/**
 * Persist agent execution steps (assistant thoughts, tool calls, tool results)
 * to the database.
 *
 * Unified for both the streaming API endpoint and the background worker.
 * The `target` and `confirmationStatus` fields are always written — worker
 * callers can rely on the defaults (`"server"` / `null`) already present in
 * the `ToolCallRecord` objects produced by the engine.
 */
export const persistAgentResult = async (params: {
  drizzle: DrizzleClient;
  sessionId: number;
  steps: AgentStep[];
}): Promise<void> => {
  const { drizzle, sessionId, steps } = params;

  for (const step of steps) {
    if (!step.thought && step.toolCalls.length === 0) continue;

    // oxlint-disable-next-line no-await-in-loop -- steps must be persisted in order
    const [msgRow] = await drizzle
      .insert(agentMessage)
      .values({
        sessionId,
        role: "ASSISTANT",
        content: step.thought,
        toolCallId: null,
        stepIndex: step.index,
      })
      .returning({ id: agentMessage.id });

    if (step.toolCalls.length > 0 && msgRow) {
      // oxlint-disable-next-line no-await-in-loop -- must complete before tool result messages
      await drizzle.insert(agentToolCall).values(
        step.toolCalls.map((tc: ToolCallRecord) => ({
          messageId: msgRow.id,
          toolCallId: tc.id,
          toolName: tc.toolName,
          // oxlint-disable-next-line no-unsafe-type-assertion -- Record<string, unknown> is JSONType-compatible
          arguments: tc.arguments as JSONType,
          // oxlint-disable-next-line no-unsafe-type-assertion -- tool result is JSON-serializable
          result: tc.result as JSONType | undefined,
          error: tc.error,
          durationMs: tc.durationMs,
          target:
            tc.target === "client" ? ("CLIENT" as const) : ("SERVER" as const),
          confirmationStatus: tc.confirmationStatus
            ? CONFIRMATION_STATUS_TO_ENUM[tc.confirmationStatus]
            : null,
        })),
      );

      // Persist tool result messages
      for (const tc of step.toolCalls) {
        // oxlint-disable-next-line no-await-in-loop -- tool result messages must be sequential
        await drizzle.insert(agentMessage).values({
          sessionId,
          role: "TOOL",
          content: tc.error ? `Error: ${tc.error}` : JSON.stringify(tc.result),
          toolCallId: tc.id,
          stepIndex: step.index,
        });
      }
    }
  }
};

// ─── Update Session Status ───

/**
 * Update the session status based on the agent's finish reason.
 *
 * Per the unified strategy: sessions stay ACTIVE after completion so the user
 * can continue the conversation. Only `"error"` transitions to FAILED.
 */
export const updateSessionStatus = async (params: {
  drizzle: DrizzleClient;
  sessionId: number;
  finishReason: string;
}): Promise<void> => {
  const { drizzle, sessionId, finishReason } = params;

  if (finishReason === "error") {
    await drizzle
      .update(agentSession)
      .set({ status: "FAILED" })
      .where(eq(agentSession.id, sessionId));
  }
  // All other reasons (completed, max_steps, implicit_completion, cancelled)
  // keep the session ACTIVE so the user can extend or continue.
};
