import type { JSONType } from "@cat/shared";

import { agentRun, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const LoadAgentRunSnapshotQuerySchema = z.object({
  externalId: z.string(),
});

export type LoadAgentRunSnapshotQuery = z.infer<
  typeof LoadAgentRunSnapshotQuerySchema
>;

export const loadAgentRunSnapshot: Query<
  LoadAgentRunSnapshotQuery,
  JSONType
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select({ blackboardSnapshot: agentRun.blackboardSnapshot })
    .from(agentRun)
    .where(eq(agentRun.externalId, query.externalId))
    .limit(1);

  return row?.blackboardSnapshot ?? null;
};
