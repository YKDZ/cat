import type { JSONType } from "@cat/shared/schema/json";

import { agentRun, asc, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListAgentRunSnapshotsBySessionQuerySchema = z.object({
  sessionId: z.int(),
});

export type AgentRunSnapshotBySessionRow = {
  externalId: string;
  status: string;
  startedAt: Date;
  completedAt: Date | null;
  blackboardSnapshot: JSONType;
};

export const listAgentRunSnapshotsBySession: Query<
  z.infer<typeof ListAgentRunSnapshotsBySessionQuerySchema>,
  AgentRunSnapshotBySessionRow[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      externalId: agentRun.externalId,
      status: agentRun.status,
      startedAt: agentRun.startedAt,
      completedAt: agentRun.completedAt,
      blackboardSnapshot: agentRun.blackboardSnapshot,
    })
    .from(agentRun)
    .where(eq(agentRun.sessionId, query.sessionId))
    .orderBy(asc(agentRun.startedAt), asc(agentRun.id));
};
