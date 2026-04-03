import type { LLMProvider, PluginManager } from "@cat/plugin-core";

import type { EventEnvelopeInput } from "@/graph/events";
import type { AgentToolDefinition } from "@/tools/types";

export {
  BlackboardSnapshotSchema,
  EdgeConditionSchema,
  EdgeDefinitionSchema,
  EventIdSchema,
  GraphDefinitionSchema,
  IdempotencyConfigSchema,
  NodeConfigSchema,
  NodeDefinitionSchema,
  NodeIdSchema,
  NodeTypeSchema,
  PatchMetadataSchema,
  PatchSchema,
  RetryConfigSchema,
  RunIdSchema,
  RunStatusSchema,
} from "@cat/graph";

export type {
  BlackboardSnapshot,
  EdgeCondition,
  EdgeDefinition,
  EventId,
  GraphDefinition,
  NodeDefinition,
  NodeId,
  NodeType,
  Patch,
  PatchMetadata,
  RetryConfig,
  RunId,
  RunStatus,
} from "@cat/graph";

export type NodeExecutionResult = {
  patch?: import("@cat/graph").Patch;
  output?: unknown;
  status: "completed" | "paused" | "error";
  pauseReason?: string;
  error?: string;
  events?: EventEnvelopeInput[];
};

export type NodeExecutionContext = {
  runId: import("@cat/graph").RunId;
  nodeId: import("@cat/graph").NodeId;
  snapshot: import("@cat/graph").BlackboardSnapshot;
  signal?: AbortSignal;
  idempotencyKey?: string;
};

export type GraphRuntimeContext = {
  llmProvider?: LLMProvider;
  tools?: AgentToolDefinition[];
  systemPrompt?: string;
  pluginManager?: PluginManager;
};
