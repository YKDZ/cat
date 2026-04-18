import type { JSONType } from "@cat/shared/schema/json";

import { agentRun, and, desc, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetLatestCompletedRunBlackboardQuerySchema = z.object({
  sessionId: z.int(),
});

export type GetLatestCompletedRunBlackboardQuery = z.infer<
  typeof GetLatestCompletedRunBlackboardQuerySchema
>;

export type LatestCompletedRunBlackboard = {
  blackboardSnapshot: JSONType;
} | null;

export const getLatestCompletedRunBlackboard: Query<
  GetLatestCompletedRunBlackboardQuery,
  LatestCompletedRunBlackboard
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ blackboardSnapshot: agentRun.blackboardSnapshot })
      .from(agentRun)
      .where(
        and(
          eq(agentRun.sessionId, query.sessionId),
          eq(agentRun.status, "completed"),
        ),
      )
      .orderBy(desc(agentRun.completedAt))
      .limit(1),
  );
};
