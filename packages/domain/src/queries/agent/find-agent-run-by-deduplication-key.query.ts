import { agentRun, eq } from "@cat/db";
import * as z from "zod";

import type { AgentRunMetadataRow } from "#/queries/agent/load-agent-run-metadata.query.ts";
import type { Query } from "#/types.ts";

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
      sessionId: agentRun.sessionId,
      externalId: agentRun.externalId,
      status: agentRun.status,
      graphDefinition: agentRun.graphDefinition,
      currentNodeId: agentRun.currentNodeId,
      deduplicationKey: agentRun.deduplicationKey,
      startedAt: agentRun.startedAt,
      completedAt: agentRun.completedAt,
      metadata: agentRun.metadata,
      ownerId: agentRun.ownerId,
      ownerEpoch: agentRun.ownerEpoch,
      ownerLeaseExpiresAt: agentRun.ownerLeaseExpiresAt,
    })
    .from(agentRun)
    .where(eq(agentRun.deduplicationKey, query.deduplicationKey))
    .limit(1);

  return row ?? null;
};
