import type { ChatMessage } from "@cat/plugin-core";

// ─── Types ───

/**
 * Minimal representation of a persisted agent message row as returned by
 * `loadConversationHistory`. Only the fields needed for message-building
 * are included.
 */
export interface PersistedMessage {
  id: number;
  role: string;
  content: string | null;
  toolCallId: string | null;
}

export interface PersistedToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

// ─── Role Mapping ───

const DB_ROLE_TO_LLM_ROLE: Record<
  string,
  "system" | "user" | "assistant" | "tool"
> = {
  SYSTEM: "system",
  USER: "user",
  ASSISTANT: "assistant",
  TOOL: "tool",
};

/**
 * Build the `ChatMessage[]` array ready to be passed to `runAgent`.
 *
 * Handles:
 * - Conditional system prompt insertion (only if no existing SYSTEM message)
 * - DB role → LLM role mapping
 * - Tool call attachment for assistant messages
 * - Appending the new user message
 */
export const buildChatMessages = (params: {
  systemPrompt: string;
  existingMessages: PersistedMessage[];
  toolCallsByMsgId: Map<number, PersistedToolCallInfo[]>;
  newUserMessage: string;
}): ChatMessage[] => {
  const { systemPrompt, existingMessages, toolCallsByMsgId, newUserMessage } =
    params;

  const chatMessages: ChatMessage[] = [];

  // System prompt — only inject if no persisted system message exists
  const hasSystem = existingMessages.some((m) => m.role === "SYSTEM");
  if (!hasSystem) {
    chatMessages.push({ role: "system", content: systemPrompt });
  }

  // Existing conversation
  for (const m of existingMessages) {
    const mappedRole = DB_ROLE_TO_LLM_ROLE[m.role] ?? "user";
    const tcList = toolCallsByMsgId.get(m.id);
    chatMessages.push({
      role: mappedRole,
      content: m.content ?? "",
      toolCallId: m.toolCallId ?? undefined,
      toolCalls: tcList && tcList.length > 0 ? tcList : undefined,
    });
  }

  // New user message
  chatMessages.push({ role: "user", content: newUserMessage });

  return chatMessages;
};
