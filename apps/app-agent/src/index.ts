// ─── Agent Definition Schema ───
export {
  AgentDefinitionSchema,
  AgentLLMConfigSchema,
  AgentConstraintsSchema,
  OrchestrationSchema,
  PipelineStageSchema,
  SystemPromptVariableSchema,
  type AgentDefinition,
  type AgentLLMConfig,
  type AgentConstraints,
  type Orchestration,
  type PipelineStage,
  type SystemPromptVariable,
} from "./schema/index";

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
  ContextManager,
  type ContextManagerOptions,
  type AgentRunOptions,
  type AgentRunResult,
  type AgentStep,
  type ToolCallRecord,
} from "./engine/index";

// ─── Orchestrator ───
export {
  runPipeline,
  type PipelineOptions,
  type AgentRunner,
  type OrchestrationMode,
  type OrchestrationResult,
  type PipelineResult,
  type PipelineStageResult,
} from "./orchestrator/index";

// ─── Prompt Utilities ───
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
