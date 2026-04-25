import type { JSONType } from "@cat/shared";

import { agentEvent, agentRun, and, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetRunNodeEventsQuerySchema = z.object({
  runExternalId: z.string(),
  nodeId: z.string().min(1),
});

export type GetRunNodeEventsQuery = z.infer<typeof GetRunNodeEventsQuerySchema>;

export type RunNodeEventRow = {
  eventId: string;
  parentEventId: string | null;
  nodeId: string | null;
  type: string;
  payload: JSONType;
  timestamp: Date;
};

export const getRunNodeEvents: Query<
  GetRunNodeEventsQuery,
  RunNodeEventRow[]
> = async (ctx, query) => {
  const runRows = await ctx.db
    .select({ id: agentRun.id })
    .from(agentRun)
    .where(eq(agentRun.externalId, query.runExternalId))
    .limit(1);

  const run = runRows[0];
  if (!run) return [];

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
    .where(
      and(eq(agentEvent.runId, run.id), eq(agentEvent.nodeId, query.nodeId)),
    )
    .orderBy(agentEvent.timestamp);
};
