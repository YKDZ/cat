import type { JSONType } from "@cat/shared/schema/json";

import { agentDefinition, agentSession, and, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetAgentSessionByExternalIdQuerySchema = z.object({
  externalId: z.uuidv4(),
  userId: z.uuidv4().optional(),
});

export type GetAgentSessionByExternalIdQuery = z.infer<
  typeof GetAgentSessionByExternalIdQuerySchema
>;

export type AgentSessionByExternalId = {
  id: number;
  externalId: string;
  agentDefinitionId: number;
  agentDefinitionExternalId: string;
  projectId: string | null;
  currentRunId: number | null;
  status: string;
  userId: string | null;
  metadata: JSONType;
};

export const getAgentSessionByExternalId: Query<
  GetAgentSessionByExternalIdQuery,
  AgentSessionByExternalId | null
> = async (ctx, query) => {
  const conditions = [eq(agentSession.externalId, query.externalId)];
  if (query.userId) {
    conditions.push(eq(agentSession.userId, query.userId));
  }

  return assertSingleOrNull(
    await ctx.db
      .select({
        id: agentSession.id,
        externalId: agentSession.externalId,
        agentDefinitionId: agentSession.agentDefinitionId,
        agentDefinitionExternalId: agentDefinition.externalId,
        projectId: agentSession.projectId,
        currentRunId: agentSession.currentRunId,
        status: agentSession.status,
        userId: agentSession.userId,
        metadata: agentSession.metadata,
      })
      .from(agentSession)
      .innerJoin(
        agentDefinition,
        eq(agentSession.agentDefinitionId, agentDefinition.id),
      )
      .where(and(...conditions))
      .limit(1),
  );
};
