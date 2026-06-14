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
  /** Optional VCS context for Direct mode audit */
  vcsContext?: VCSContext;
  /** Optional VCS middleware instance */
  vcsMiddleware?: VCSMiddleware;
};
