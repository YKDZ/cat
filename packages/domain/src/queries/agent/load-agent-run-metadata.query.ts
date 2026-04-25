import type { JSONType, NonNullJSONType } from "@cat/shared";

import { agentRun, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const LoadAgentRunMetadataQuerySchema = z.object({
  externalId: z.string(),
});

export type LoadAgentRunMetadataQuery = z.infer<
  typeof LoadAgentRunMetadataQuerySchema
>;

export type AgentRunMetadataRow = {
  externalId: string;
  status: string;
  graphDefinition: NonNullJSONType;
  currentNodeId: string | null;
  deduplicationKey: string | null;
  startedAt: Date;
  completedAt: Date | null;
  metadata: JSONType;
};

export const loadAgentRunMetadata: Query<
  LoadAgentRunMetadataQuery,
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
    .where(eq(agentRun.externalId, query.externalId))
    .limit(1);

  return row ?? null;
};
