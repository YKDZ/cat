// ─── Session Management (shared between API + Worker) ───

export {
  loadConversationHistory,
  type ConversationHistory,
} from "./history-loader";

export {
  buildChatMessages,
  type PersistedMessage,
  type PersistedToolCallInfo,
} from "./message-builder";

export {
  persistAgentResult,
  persistUserMessage,
  updateSessionStatus,
} from "./persistence";

export { buildSystemPrompt } from "./prompt-builder";

export {
  resolveDefinition,
  resolveSession,
  type ResolvedSession,
} from "./resolve";

export { AgentSessionMetaSchema, type AgentSessionMeta } from "./schema";

export { setupToolRegistry } from "./tool-setup";
