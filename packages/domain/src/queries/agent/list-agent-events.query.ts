import type { NonNullJSONType } from "@cat/shared/schema/json";

import { agentEvent, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAgentEventsQuerySchema = z.object({
  runInternalId: z.int(),
});

export type ListAgentEventsQuery = z.infer<typeof ListAgentEventsQuerySchema>;

export type AgentEventRow = {
  eventId: string;
  parentEventId: string | null;
  nodeId: string | null;
  type: string;
  payload: NonNullJSONType;
  timestamp: Date;
};

export const listAgentEvents: Query<
  ListAgentEventsQuery,
  AgentEventRow[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      eventId: agentEvent.eventId,
      parentEventId: agentEvent.parentEventId,
      nodeId: agentEvent.nodeId,
      type: agentEvent.type,
      payload: agentEvent.payload,
      timestamp: agentEvent.timestamp,
    })
    .from(agentEvent)
    .where(eq(agentEvent.runId, query.runInternalId))
    .orderBy(agentEvent.timestamp);
};
