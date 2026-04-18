import type { JSONType } from "@cat/shared/schema/json";

import { agentRun, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetAgentRunRuntimeStateQuerySchema = z.object({
  runId: z.uuidv4(),
});

export type GetAgentRunRuntimeStateQuery = z.infer<
  typeof GetAgentRunRuntimeStateQuerySchema
>;

export type AgentRunRuntimeState = {
  sessionId: number;
  metadata: JSONType;
};

export const getAgentRunRuntimeState: Query<
  GetAgentRunRuntimeStateQuery,
  AgentRunRuntimeState | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        sessionId: agentRun.sessionId,
        metadata: agentRun.metadata,
      })
      .from(agentRun)
      .where(eq(agentRun.externalId, query.runId))
      .limit(1),
  );
};
