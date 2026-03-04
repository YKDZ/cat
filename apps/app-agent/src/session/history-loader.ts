import {
  agentMessage,
  agentToolCall,
  eq,
  getColumns,
  inArray,
  type DrizzleClient,
} from "@cat/db";

import type {
  PersistedMessage,
  PersistedToolCallInfo,
} from "./message-builder";

// ─── Types ───

export interface ConversationHistory {
  messages: PersistedMessage[];
  toolCallsByMsgId: Map<number, PersistedToolCallInfo[]>;
}

// ─── Load Conversation History ───

/**
 * Load the full conversation history for an agent session, including the
 * tool-call records associated with assistant messages.
 *
 * The LLM API (e.g. OpenAI) requires assistant messages that triggered tool
 * calls to carry the `toolCalls` array so that subsequent `tool`-role messages
 * are properly paired.
 */
export const loadConversationHistory = async (
  drizzle: DrizzleClient,
  sessionId: number,
): Promise<ConversationHistory> => {
  // Load all messages in chronological order
  const messages = await drizzle
    .select({ ...getColumns(agentMessage) })
    .from(agentMessage)
    .where(eq(agentMessage.sessionId, sessionId))
    .orderBy(agentMessage.createdAt);

  // Collect assistant message IDs for the tool-call query
  const assistantMsgIds = messages
    .filter((m) => m.role === "ASSISTANT")
    .map((m) => m.id);

  const toolCallsByMsgId = new Map<number, PersistedToolCallInfo[]>();

  if (assistantMsgIds.length > 0) {
    const tcRows = await drizzle
      .select({
        messageId: agentToolCall.messageId,
        toolCallId: agentToolCall.toolCallId,
        toolName: agentToolCall.toolName,
        arguments: agentToolCall.arguments,
      })
      .from(agentToolCall)
      .where(inArray(agentToolCall.messageId, assistantMsgIds));

    for (const row of tcRows) {
      const list = toolCallsByMsgId.get(row.messageId) ?? [];
      list.push({
        id: row.toolCallId,
        name: row.toolName,
        arguments:
          typeof row.arguments === "string"
            ? row.arguments
            : JSON.stringify(row.arguments),
      });
      toolCallsByMsgId.set(row.messageId, list);
    }
  }

  // Map to the minimal PersistedMessage shape
  const persistedMessages: PersistedMessage[] = messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    toolCallId: m.toolCallId,
  }));

  return { messages: persistedMessages, toolCallsByMsgId };
};
