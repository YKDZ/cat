import { agentRun, eq } from "@cat/db";
import * as z from "zod/v4";

import type { AgentRunMetadataRow } from "@/queries/agent/load-agent-run-metadata.query";
import type { Query } from "@/types";

export const FindAgentRunByDeduplicationKeyQuerySchema = z.object({
  deduplicationKey: z.string(),
});

export type FindAgentRunByDeduplicationKeyQuery = z.infer<
  typeof FindAgentRunByDeduplicationKeyQuerySchema
>;

export const findAgentRunByDeduplicationKey: Query<
  FindAgentRunByDeduplicationKeyQuery,
  AgentRunMetadataRow | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select({
      externalId: agentRun.externalId,
      status: agentRun.status,
      graphDefinition: agentRun.graphDefinition,
      currentNodeId: agentRun.currentNodeId,
      deduplicationKey: agentRun.deduplicationKey,
      startedAt: agentRun.startedAt,
      completedAt: agentRun.completedAt,
      metadata: agentRun.metadata,
    })
    .from(agentRun)
    .where(eq(agentRun.deduplicationKey, query.deduplicationKey))
    .limit(1);

  return row ?? null;
};
