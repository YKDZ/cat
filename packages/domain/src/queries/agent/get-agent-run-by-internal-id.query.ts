import type { JSONType } from "@cat/shared/schema/json";

import { agentRun, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetAgentRunByInternalIdQuerySchema = z.object({
  id: z.int(),
});

export type GetAgentRunByInternalIdQuery = z.infer<
  typeof GetAgentRunByInternalIdQuerySchema
>;

/**
 * @zh 按内部 ID 查询 Agent 运行记录及其黑板快照。
 * @en Query an agent run and its blackboard snapshot by internal ID.
 */
export type AgentRunByInternalId = {
  externalId: string;
  status: string;
  blackboardSnapshot: JSONType;
  startedAt: Date;
  completedAt: Date | null;
} | null;

export const getAgentRunByInternalId: Query<
  GetAgentRunByInternalIdQuery,
  AgentRunByInternalId
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        externalId: agentRun.externalId,
        status: agentRun.status,
        blackboardSnapshot: agentRun.blackboardSnapshot,
        startedAt: agentRun.startedAt,
        completedAt: agentRun.completedAt,
      })
      .from(agentRun)
      .where(eq(agentRun.id, query.id))
      .limit(1),
  );
};
