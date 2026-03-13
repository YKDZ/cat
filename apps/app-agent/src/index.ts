// ─── Tool Registry ───
export {
  ToolRegistry,
  createToolRegistry,
  builtinTools,
  builtinClientTools,
  defineTool,
  defineClientTool,
  finishTaskTool,
  FINISH_TOOL_NAME,
  type AgentToolDefinition,
  type ToolExecutionContext,
  type ToolConfirmationPolicy,
  type ToolTarget,
} from "./tools/index";

// ─── ReAct Engine ───
export {
  runAgent,
  runCompletion,
  runFim,
  ContextManager,
  type ContextManagerOptions,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentStep,
  type ToolCallRecord,
  type CompletionOptions,
  type CompletionChunk,
  type FimOptions,
  type FimChunk,
} from "./engine/index";

// ─── Pipeline Compatibility ───
export {
  runPipeline,
  type PipelineOptions,
  type AgentRunner,
  type OrchestrationMode,
  type OrchestrationResult,
  type PipelineResult,
  type PipelineStageResult,
} from "./graph/pipeline-runner";

// ─── Context Resolution Engine ───
export {
  resolveContextVariables,
  topoSortProviders,
  CircularDependencyError,
  BuiltinGlossaryProvider,
  BuiltinContextDescriptionProvider,
  BuiltinToolDescriptionProvider,
  createBuiltinProviders,
  type SeedVariables,
  type ResolveOptions,
} from "./context/index";

// ─── Prompt Utilities (deprecated — logic migrated to builtin providers) ───
export {
  generateContextVariableDescriptions,
  generateToolDescriptions,
  injectContextVariables,
  injectToolDescriptions,
} from "./utils/prompt";

// ─── Session Management (shared between API + Worker) ───
export {
  AgentSessionMetaSchema,
  buildChatMessages,
  buildSystemPrompt,
  loadConversationHistory,
  persistAgentResult,
  persistUserMessage,
  resolveDefinition,
  resolveSession,
  setupToolRegistry,
  updateSessionStatus,
  type AgentSessionMeta,
  type ConversationHistory,
  type PersistedMessage,
  type PersistedToolCallInfo,
  type ResolvedSession,
} from "./session/index";

// ─── Graph Engine ───
export * from "./graph/index";
