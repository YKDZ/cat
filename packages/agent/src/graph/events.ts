import type { JSONObject } from "@cat/shared/schema/json";

import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

import { EventIdSchema } from "@/graph/types";

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
  "llm:thinking",
  "llm:token",
  "llm:complete",
  "llm:error",
  "tool:call",
  "tool:result",
  "tool:error",
  "tool:confirm:required",
  "tool:confirm:response",
  "human:input:required",
  "human:input:received",
  "checkpoint:saved",
  "workflow:translation:created",
  "workflow:qa:issue",
  "workflow:suggestion:ready",
] as const;

export const EventTypeSchema = z.enum(EventTypeValues);

export type EventType = z.infer<typeof EventTypeSchema>;

export type AgentEventPayload =
  | string
  | number
  | boolean
  | unknown[]
  | Record<string, unknown>;

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
  payload: AgentEventPayload;
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

const agentEventBaseShape = {
  eventId: z.string(),
  runId: z.string(),
  nodeId: z.string().optional(),
  parentEventId: z.string().optional(),
  timestamp: z.iso.datetime(),
  metadata: safeZDotJson.optional(),
} as const;

export const EventPayloadSchema = z.custom<AgentEventPayload>((payload) =>
  nonNullSafeZDotJson.safeParse(payload).success,
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

export const EventEnvelopeInputSchema = z.object({
  type: EventTypeSchema,
  payload: EventPayloadSchema.default({}),
  metadata: safeZDotJson.optional(),
  parentEventId: EventIdSchema.optional(),
  timestamp: z.iso.datetime().optional(),
});

export type EventEnvelopeInput = z.infer<typeof EventEnvelopeInputSchema>;

export const normalizeEventEnvelope = (
  runId: string,
  nodeId: string | undefined,
  eventLike: EventEnvelopeInput,
): AgentEventLike => {
  const parsed = EventEnvelopeInputSchema.parse(eventLike);

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
