import { nonNullSafeZDotJson, safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod/v4";

import { EventIdSchema, NodeIdSchema, RunIdSchema } from "@/graph/types";

export const EventTypeSchema = z.enum([
  "run:start",
  "run:pause",
  "run:resume",
  "run:cancel",
  "run:end",
  "run:error",
  "node:start",
  "node:end",
  "node:error",
  "node:retry",
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
]);

export type EventType = z.infer<typeof EventTypeSchema>;

export const AgentEventSchema = z.object({
  eventId: EventIdSchema,
  runId: RunIdSchema,
  nodeId: NodeIdSchema.optional(),
  parentEventId: EventIdSchema.optional(),
  type: EventTypeSchema,
  timestamp: z.iso.datetime(),
  payload: nonNullSafeZDotJson,
  metadata: safeZDotJson.optional(),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;

export type EventHandler = (event: AgentEvent) => Promise<void> | void;
