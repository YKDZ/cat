import type { JSONObject } from "@cat/shared/schema/json";

import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

import { EventIdSchema, NodeTypeSchema } from "@/graph/types";

// ─── Event Types ─────────────────────────────────────────────────

export const EventTypeValues = [
  "run:start",
  "run:pause",
  "run:resume",
  "run:cancel",
  "run:end",
  "run:error",
  "run:compensation:start",
  "run:compensation:end",
  "node:start",
  "node:end",
  "node:error",
  "node:retry",
  "node:lease:acquired",
  "node:lease:expired",
  "node:lease:reclaimed",
  "human:input:required",
  "human:input:received",
  "checkpoint:saved",
  "workflow:translation:created",
  "workflow:qa:issue",
  "workflow:suggestion:ready",
  "tool:call",
  "tool:result",
] as const;

export const EventTypeSchema = z.enum(EventTypeValues);

export type EventType = z.infer<typeof EventTypeSchema>;

// ─── Per-Event Payload Schemas ───────────────────────────────────

export const eventPayloadSchemas = {
  // Run lifecycle
  "run:start": z.object({ graphId: z.string(), input: z.unknown() }),
  "run:pause": z.object({}),
  "run:resume": z.object({}),
  "run:cancel": z.object({}),
  "run:end": z.object({
    status: z.string(),
    blackboard: z.unknown().optional(),
    finalMessage: z.string().nullable().optional(),
  }),
  "run:error": z.object({ error: z.string() }),
  "run:compensation:start": z.object({ count: z.int() }),
  "run:compensation:end": z.record(z.string(), z.unknown()),

  // Node lifecycle
  "node:start": z.object({ nodeType: NodeTypeSchema, config: z.unknown() }),
  "node:end": z.object({
    status: z.string(),
    output: z.unknown(),
    patch: z.unknown(),
    pauseReason: z.string().nullable(),
    nodeType: NodeTypeSchema.optional(),
  }),
  "node:error": z.object({ error: z.string() }),
  "node:retry": z.object({
    attempt: z.int(),
    maxAttempts: z.int(),
    error: z.string(),
  }),
  "node:lease:acquired": z.object({
    leaseId: z.string(),
    expiresAt: z.string(),
    heartbeatIntervalMs: z.number(),
  }),
  "node:lease:expired": z.object({ leaseId: z.string() }),
  "node:lease:reclaimed": z.object({
    leaseId: z.string(),
    expiresAt: z.string(),
  }),

  // Human input
  "human:input:required": z.object({
    prompt: z.string(),
    timeoutMs: z.number().nonnegative(),
    inputPath: z.string(),
  }),
  "human:input:received": z.object({ nodeId: z.string(), input: z.unknown() }),

  // Checkpoint
  "checkpoint:saved": z.object({}),

  // Workflow domain events
  "workflow:translation:created": z.object({
    documentId: z.uuidv4().optional(),
    translationIds: z.array(z.number()),
  }),
  "workflow:qa:issue": z.object({
    traceId: z.string(),
    result: z.array(z.record(z.string(), z.unknown())),
  }),
  "workflow:suggestion:ready": z.object({
    elementId: z.int(),
    suggestion: z.record(z.string(), z.unknown()),
  }),

  // Tool events
  "tool:call": z.object({
    toolName: z.string(),
    toolCallId: z.string(),
  }),
  "tool:result": z.object({
    toolCallId: z.string(),
    content: z.string(),
  }),
} as const satisfies Record<EventType, z.ZodType>;

/** Maps each EventType to its inferred payload type. */
export type EventPayloadMap = {
  [K in EventType]: z.infer<(typeof eventPayloadSchemas)[K]>;
};

// ─── Legacy generic payload (kept for backward compat) ──────────

export type AgentEventPayload =
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>;

// ─── AgentEvent (full event with typed payload) ──────────────────

type AgentEventBase = {
  eventId: string;
  runId: string;
  nodeId?: string;
  parentEventId?: string;
  timestamp: string;
  metadata?: JSONObject;
};

type AgentEventVariant<T extends EventType> = AgentEventBase & {
  type: T;
  payload: EventPayloadMap[T];
};

export type AgentEvent = {
  [Key in EventType]: AgentEventVariant<Key>;
}[EventType];

export type AgentEventOf<T extends EventType> = AgentEventVariant<T>;

export type AgentEventLike = {
  eventId?: string;
  runId: string;
  nodeId?: string;
  parentEventId?: string;
  type: EventType;
  timestamp: string;
  payload: unknown;
  metadata?: JSONObject;
};

// ─── Runtime Schemas (AgentEvent) ────────────────────────────────

const agentEventBaseShape = {
  eventId: z.string(),
  runId: z.string(),
  nodeId: z.string().optional(),
  parentEventId: z.string().optional(),
  timestamp: z.iso.datetime(),
  metadata: safeZDotJson.optional(),
} as const;

export const EventPayloadSchema = z.custom<AgentEventPayload>(
  (payload) => nonNullSafeZDotJson.safeParse(payload).success,
);

const createAgentEventVariantSchema = <T extends EventType>(type: T) => {
  return z.object({
    ...agentEventBaseShape,
    type: z.literal(type),
    payload: EventPayloadSchema,
  });
};

const [firstEventType, ...restEventTypes] = EventTypeValues;

export const AgentEventSchema = z.discriminatedUnion("type", [
  createAgentEventVariantSchema(firstEventType),
  ...restEventTypes.map((type) => createAgentEventVariantSchema(type)),
]);

export const createAgentEvent = (eventLike: AgentEventLike): AgentEvent => {
  const parsed = AgentEventSchema.parse({
    ...eventLike,
    eventId: eventLike.eventId ?? crypto.randomUUID(),
  });

  // oxlint-disable-next-line no-unsafe-type-assertion -- validated by AgentEventSchema; this only narrows TS's widened discriminant inference.
  return parsed as AgentEvent;
};

export type EventHandler<T extends EventType = EventType> = (
  event: AgentEventOf<T>,
) => Promise<void> | void;

// ─── EventEnvelopeInput (typed discriminated union for addEvent/emit) ──

type EventEnvelopeBase = {
  metadata?: JSONObject;
  parentEventId?: string;
  timestamp?: string;
};

export type EventEnvelopeInput = {
  [K in EventType]: EventEnvelopeBase & {
    type: K;
    payload: EventPayloadMap[K];
  };
}[EventType];

const createEventEnvelopeVariant = <T extends EventType>(type: T) => {
  return z.object({
    type: z.literal(type),
    payload: eventPayloadSchemas[type],
    metadata: safeZDotJson.optional(),
    parentEventId: EventIdSchema.optional(),
    timestamp: z.iso.datetime().optional(),
  });
};

const [firstEnvelopeType, ...restEnvelopeTypes] = EventTypeValues;

export const EventEnvelopeInputSchema = z.discriminatedUnion("type", [
  createEventEnvelopeVariant(firstEnvelopeType),
  ...restEnvelopeTypes.map((type) => createEventEnvelopeVariant(type)),
]);

export const normalizeEventEnvelope = (
  runId: string,
  nodeId: string | undefined,
  eventLike: EventEnvelopeInput,
): AgentEventLike => {
  // oxlint-disable-next-line no-unsafe-type-assertion -- EventEnvelopeInput is already validated by TS; runtime parse uses the corresponding Zod union
  const parsed = EventEnvelopeInputSchema.parse(
    eventLike,
  ) as EventEnvelopeInput;

  return {
    runId,
    ...(nodeId ? { nodeId } : {}),
    type: parsed.type,
    timestamp: parsed.timestamp ?? new Date().toISOString(),
    payload: parsed.payload,
    ...(parsed.metadata ? { metadata: parsed.metadata } : {}),
    ...(parsed.parentEventId ? { parentEventId: parsed.parentEventId } : {}),
  };
};
