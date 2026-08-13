import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  ne,
  or,
  recallDerivationState,
  recallDerivationTaskDemand,
  task,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListRecallDerivationTasksNeedingProjectionQuerySchema =
  z.strictObject({
    limit: z.int().min(1).max(100).default(25),
  });

/**
 * Bounded reconciliation work. A Task is selected only when a linked demand
 * changed since its snapshot or its revision diverged.
 */
export const listRecallDerivationTasksNeedingProjection: Query<
  z.infer<typeof ListRecallDerivationTasksNeedingProjectionQuerySchema>,
  string[]
> = async (ctx, input) => {
  const query =
    ListRecallDerivationTasksNeedingProjectionQuerySchema.parse(input);
  return (
    await ctx.db
      .selectDistinct({ taskId: task.id, updatedAt: task.updatedAt })
      .from(task)
      .innerJoin(
        recallDerivationTaskDemand,
        eq(recallDerivationTaskDemand.taskId, task.id),
      )
      .leftJoin(
        recallDerivationState,
        eq(
          recallDerivationTaskDemand.derivationStateId,
          recallDerivationState.id,
        ),
      )
      .where(
        and(
          eq(task.kind, "RECALL_DERIVATION"),
          inArray(task.status, ["PENDING", "RUNNING", "BLOCKED"]),
          isNull(recallDerivationTaskDemand.detachedAt),
          isNull(recallDerivationTaskDemand.supersededAt),
          or(
            isNull(recallDerivationTaskDemand.derivationStateId),
            ne(
              recallDerivationState.taskProjectionRevision,
              recallDerivationTaskDemand.observedProjectionRevision,
            ),
          ),
        ),
      )
      .orderBy(asc(task.updatedAt), asc(task.id))
      .limit(query.limit)
  ).map((row) => row.taskId);
};
