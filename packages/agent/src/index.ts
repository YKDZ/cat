// ─── Builtin Agent Templates ───
export {
  builtinAgentTemplates,
  getBuiltinAgentTemplate,
  type BuiltinAgentTemplate,
} from "./agent";

// ─── Tool Registry ───
export {
  ToolRegistry,
  createToolRegistry,
  builtinTools,
  defineTool,
  finishTaskTool,
  FINISH_TOOL_NAME,
  type AgentToolDefinition,
  type ToolExecutionContext,
  type ToolConfirmationPolicy,
} from "./tools/index";

// ─── LLM Utilities ───
export {
  runCompletion,
  runFim,
  type CompletionOptions,
  type CompletionChunk,
  type FimOptions,
  type FimChunk,
} from "./llm/index";

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

// ─── Session Management (shared between API + Worker) ───
export {
  AgentSessionMetaSchema,
  mapSessionMetaToSeeds,
  buildSystemPrompt,
  rebuildConversationFromRuns,
  resolveDefinition,
  resolveSession,
  setupToolRegistry,
  type AgentSessionMeta,
  type ResolvedSession,
} from "./session/index";

// ─── Runtime Resolution ───
export * from "./runtime/index";

// ─── Graph Engine ───
export * from "./graph/index";

// ─── Workflow DSL ───
export * from "./workflow/index";
