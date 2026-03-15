import { agentSession, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetAgentSessionRuntimeStateQuerySchema = z.object({
  sessionId: z.int(),
});

export type GetAgentSessionRuntimeStateQuery = z.infer<
  typeof GetAgentSessionRuntimeStateQuerySchema
>;

export type AgentSessionRuntimeState = {
  sessionId: number;
  agentDefinitionId: number;
  userId: string | null;
  sessionMetadata: unknown;
};

export const getAgentSessionRuntimeState: Query<
  GetAgentSessionRuntimeStateQuery,
  AgentSessionRuntimeState | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        sessionId: agentSession.id,
        agentDefinitionId: agentSession.agentDefinitionId,
        userId: agentSession.userId,
        sessionMetadata: agentSession.metadata,
      })
      .from(agentSession)
      .where(eq(agentSession.id, query.sessionId))
      .limit(1),
  );
};
