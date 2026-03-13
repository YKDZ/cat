import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

export const RunIdSchema = z.uuidv4();
export const NodeIdSchema = z.string().min(1);
export const EventIdSchema = z.uuidv4();

export type RunId = z.infer<typeof RunIdSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

export const BlackboardSnapshotSchema = z.object({
  runId: RunIdSchema,
  version: z.int().nonnegative(),
  data: nonNullSafeZDotJson,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PatchMetadataSchema = z.object({
  patchId: z.uuidv4(),
  parentSnapshotVersion: z.int().nonnegative(),
  actorId: NodeIdSchema,
  timestamp: z.iso.datetime(),
});

export const PatchSchema = z.object({
  metadata: PatchMetadataSchema,
  updates: nonNullSafeZDotJson,
});

export type BlackboardSnapshot = z.infer<typeof BlackboardSnapshotSchema>;
export type PatchMetadata = z.infer<typeof PatchMetadataSchema>;
export type Patch = z.infer<typeof PatchSchema>;

export const NodeTypeSchema = z.enum([
  "llm",
  "tool",
  "router",
  "parallel",
  "join",
  "human_input",
  "transform",
  "loop",
  "subgraph",
]);

export type NodeType = z.infer<typeof NodeTypeSchema>;

export const NodeConfigSchema = safeZDotJson;

export const IdempotencyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  keyTemplate: z.string().optional(),
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.int().min(1).default(3),
  backoffMs: z.int().positive().default(1000),
  backoffMultiplier: z.number().positive().default(2),
});

export const NodeDefinitionSchema = z.object({
  id: NodeIdSchema,
  type: NodeTypeSchema,
  config: NodeConfigSchema.optional(),
  idempotency: IdempotencyConfigSchema.optional(),
  retry: RetryConfigSchema.optional(),
  timeoutMs: z.int().positive().default(120_000),
  humanInput: z
    .object({
      prompt: z.string(),
      timeoutMs: z.int().positive().optional(),
    })
    .optional(),
});

export type NodeDefinition = z.infer<typeof NodeDefinitionSchema>;

export const EdgeConditionSchema = z.object({
  type: z.enum(["expression", "schema_match", "blackboard_field"]),
  value: z.string(),
  description: z.string().optional(),
});

export const EdgeDefinitionSchema = z.object({
  from: NodeIdSchema,
  to: NodeIdSchema,
  condition: EdgeConditionSchema.optional(),
  label: z.string().optional(),
});

export type EdgeCondition = z.infer<typeof EdgeConditionSchema>;
export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;

export const GraphDefinitionSchema = z.object({
  id: z.string().min(1),
  version: z.string().default("1.0.0"),
  description: z.string().optional(),
  nodes: z.record(NodeIdSchema, NodeDefinitionSchema),
  edges: z.array(EdgeDefinitionSchema),
  entry: NodeIdSchema,
  exit: z.array(NodeIdSchema).optional(),
  config: z
    .object({
      maxConcurrentNodes: z.int().positive().default(3),
      defaultTimeoutMs: z.int().positive().default(120_000),
      enableCheckpoints: z.boolean().default(true),
      checkpointIntervalMs: z.int().positive().default(1000),
    })
    .optional(),
});

export type GraphDefinition = z.infer<typeof GraphDefinitionSchema>;

export type NodeExecutionResult = {
  patch?: Patch;
  output?: unknown;
  status: "completed" | "paused" | "error";
  pauseReason?: string;
  error?: string;
};

export type NodeExecutionContext = {
  runId: RunId;
  nodeId: NodeId;
  snapshot: BlackboardSnapshot;
  signal?: AbortSignal;
  idempotencyKey?: string;
};

export type RetryConfig = z.infer<typeof RetryConfigSchema>;
