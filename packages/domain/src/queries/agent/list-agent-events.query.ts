import { agentEvent, and, asc, eq, gt } from "@cat/db";
import type { NonNullJSONType } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListAgentEventsQuerySchema = z.object({
  runInternalId: z.int(),
  afterSequence: z.int().nonnegative().optional(),
});

export type ListAgentEventsQuery = z.infer<typeof ListAgentEventsQuerySchema>;

export type AgentEventRow = {
  sequence: number;
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
  return (
    ctx.db
      .select({
        sequence: agentEvent.id,
        eventId: agentEvent.eventId,
        parentEventId: agentEvent.parentEventId,
        nodeId: agentEvent.nodeId,
        type: agentEvent.type,
        payload: agentEvent.payload,
        timestamp: agentEvent.timestamp,
      })
      .from(agentEvent)
      .where(
        query.afterSequence === undefined
          ? eq(agentEvent.runId, query.runInternalId)
          : and(
              eq(agentEvent.runId, query.runInternalId),
              gt(agentEvent.id, query.afterSequence),
            ),
      )
      // `AgentEvent.id` is the durable append order. Timestamps describe an
      // event; they must never reorder projection after delayed delivery.
      .orderBy(asc(agentEvent.id))
  );
};
