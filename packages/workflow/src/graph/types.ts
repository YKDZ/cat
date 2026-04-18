import type { PluginManager } from "@cat/plugin-core";
import type { VCSContext, VCSMiddleware } from "@cat/vcs";

import type { EventEnvelopeInput } from "@/graph/events";

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
  pluginManager?: PluginManager;
  /** @zh 可选的 VCS 上下文，用于 Direct 模式审计 @en Optional VCS context for Direct mode audit */
  vcsContext?: VCSContext;
  /** @zh 可选的 VCS 中间件实例 @en Optional VCS middleware instance */
  vcsMiddleware?: VCSMiddleware;
};
