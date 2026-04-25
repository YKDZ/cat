import { JSONObjectSchema } from "@cat/shared";
import * as z from "zod";

// ====== ID Types ======

export const RunIdSchema = z.uuidv4();
export const NodeIdSchema = z.string().min(1);
export const EventIdSchema = z.uuidv4();

export type RunId = z.infer<typeof RunIdSchema>;
export type NodeId = z.infer<typeof NodeIdSchema>;
export type EventId = z.infer<typeof EventIdSchema>;

// ====== Run Status ======

export const RunStatusSchema = z.enum([
  "pending",
  "running",
  "paused",
  "completed",
  "failed",
  "cancelled",
]);

export type RunStatus = z.infer<typeof RunStatusSchema>;

// ====== Blackboard Snapshot ======

export const BlackboardSnapshotSchema = z.object({
  runId: RunIdSchema,
  version: z.int().nonnegative(),
  data: JSONObjectSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BlackboardSnapshot = z.infer<typeof BlackboardSnapshotSchema>;

// ====== Patch ======

export const PatchMetadataSchema = z.object({
  patchId: z.uuidv4(),
  parentSnapshotVersion: z.int().nonnegative(),
  actorId: NodeIdSchema,
  timestamp: z.iso.datetime(),
});

export const PatchSchema = z.object({
  metadata: PatchMetadataSchema,
  updates: JSONObjectSchema,
});

export type PatchMetadata = z.infer<typeof PatchMetadataSchema>;
export type Patch = z.infer<typeof PatchSchema>;

// ====== Node Types ======

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

export const IdempotencyConfigSchema = z.object({
  enabled: z.boolean().default(true),
  keyTemplate: z.string().optional(),
});

export const RetryConfigSchema = z.object({
  maxAttempts: z.int().min(1).default(3),
  backoffMs: z.int().positive().default(1000),
  backoffMultiplier: z.number().positive().default(2),
});

export type RetryConfig = z.infer<typeof RetryConfigSchema>;

export const NodeDefinitionSchema = z.object({
  id: NodeIdSchema,
  type: NodeTypeSchema,
  config: JSONObjectSchema.optional(),
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

// ====== Edge Condition — 结构化操作符格式 (Decision 5) ======

export const EdgeConditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(["eq", "neq", "exists", "not_exists", "in", "gt", "lt"]),
  value: z.unknown().optional(),
  description: z.string().optional(),
});

export type EdgeCondition = z.infer<typeof EdgeConditionSchema>;

export const EdgeDefinitionSchema = z.object({
  from: NodeIdSchema,
  to: NodeIdSchema,
  condition: EdgeConditionSchema.optional(),
  label: z.string().optional(),
});

export type EdgeDefinition = z.infer<typeof EdgeDefinitionSchema>;

// ====== Graph Definition ======

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
