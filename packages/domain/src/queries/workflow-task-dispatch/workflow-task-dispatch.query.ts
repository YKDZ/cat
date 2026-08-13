import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  or,
  sql,
  workflowTaskDispatch,
} from "@cat/db";
import * as z from "zod";

import type { WorkflowTaskDispatch } from "#/commands/workflow-task-dispatch/workflow-task-dispatch.cmd.ts";
import type { Query } from "#/types.ts";

const fields = {
  id: workflowTaskDispatch.id,
  taskId: workflowTaskDispatch.taskId,
  generation: workflowTaskDispatch.generation,
  runId: workflowTaskDispatch.runId,
  status: workflowTaskDispatch.status,
  ownerId: workflowTaskDispatch.ownerId,
  ownerEpoch: workflowTaskDispatch.ownerEpoch,
  ownerLeaseExpiresAt: workflowTaskDispatch.ownerLeaseExpiresAt,
  attemptCount: workflowTaskDispatch.attemptCount,
  agentSessionId: workflowTaskDispatch.agentSessionId,
  lastProjectedEventSequence: workflowTaskDispatch.lastProjectedEventSequence,
  settledAt: workflowTaskDispatch.settledAt,
};

export const GetWorkflowTaskDispatchByRunIdQuerySchema = z.strictObject({
  runId: z.uuidv4(),
});
export type GetWorkflowTaskDispatchByRunIdQuery = z.infer<
  typeof GetWorkflowTaskDispatchByRunIdQuerySchema
>;

/** Private workflow lookup; the result must never be mapped into Task JSON. */
export const getWorkflowTaskDispatchByRunId: Query<
  GetWorkflowTaskDispatchByRunIdQuery,
  WorkflowTaskDispatch | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select(fields)
    .from(workflowTaskDispatch)
    .where(eq(workflowTaskDispatch.runId, query.runId));
  return row ?? null;
};

export const GetLatestWorkflowTaskDispatchQuerySchema = z.strictObject({
  taskId: z.uuidv4(),
});
export type GetLatestWorkflowTaskDispatchQuery = z.infer<
  typeof GetLatestWorkflowTaskDispatchQuerySchema
>;

export const getLatestWorkflowTaskDispatch: Query<
  GetLatestWorkflowTaskDispatchQuery,
  WorkflowTaskDispatch | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select(fields)
    .from(workflowTaskDispatch)
    .where(eq(workflowTaskDispatch.taskId, query.taskId))
    .orderBy(desc(workflowTaskDispatch.generation))
    .limit(1);
  return row ?? null;
};

export const ListWorkflowTaskDispatchesForProjectionQuerySchema =
  z.strictObject({ ownerId: z.uuidv4() });
export type ListWorkflowTaskDispatchesForProjectionQuery = z.infer<
  typeof ListWorkflowTaskDispatchesForProjectionQuerySchema
>;

/** Lists local or expired dispatches in a stable order for crash recovery projection. */
export const listWorkflowTaskDispatchesForProjection: Query<
  ListWorkflowTaskDispatchesForProjectionQuery,
  WorkflowTaskDispatch[]
> = async (ctx, query) =>
  await ctx.db
    .select(fields)
    .from(workflowTaskDispatch)
    .where(
      and(
        inArray(workflowTaskDispatch.status, ["RUNNING", "CANCELLING"]),
        or(
          eq(workflowTaskDispatch.ownerId, query.ownerId),
          isNull(workflowTaskDispatch.ownerLeaseExpiresAt),
          sql`${workflowTaskDispatch.ownerLeaseExpiresAt} <= clock_timestamp()`,
        ),
      ),
    )
    .orderBy(asc(workflowTaskDispatch.createdAt), asc(workflowTaskDispatch.id));

export const ListLiveWorkflowTaskDispatchesOwnedByQuerySchema = z.strictObject({
  ownerId: z.uuidv4(),
});
export type ListLiveWorkflowTaskDispatchesOwnedByQuery = z.infer<
  typeof ListLiveWorkflowTaskDispatchesOwnedByQuerySchema
>;

/** Re-reads only this runtime's current live bindings before owner-private recovery. */
export const listLiveWorkflowTaskDispatchesOwnedBy: Query<
  ListLiveWorkflowTaskDispatchesOwnedByQuery,
  WorkflowTaskDispatch[]
> = async (ctx, query) =>
  await ctx.db
    .select(fields)
    .from(workflowTaskDispatch)
    .where(
      and(
        eq(workflowTaskDispatch.ownerId, query.ownerId),
        inArray(workflowTaskDispatch.status, [
          "CLAIMED",
          "RUNNING",
          "CANCELLING",
        ]),
        sql`${workflowTaskDispatch.ownerLeaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .orderBy(workflowTaskDispatch.createdAt);

export const GetLiveWorkflowTaskDispatchOwnedByFenceQuerySchema =
  z.strictObject({
    dispatchId: z.uuidv4(),
    ownerId: z.uuidv4(),
    ownerEpoch: z.int().positive(),
  });
export type GetLiveWorkflowTaskDispatchOwnedByFenceQuery = z.infer<
  typeof GetLiveWorkflowTaskDispatchOwnedByFenceQuerySchema
>;

/** Returns a binding only while the exact owner fence remains live at the DB clock. */
export const getLiveWorkflowTaskDispatchOwnedByFence: Query<
  GetLiveWorkflowTaskDispatchOwnedByFenceQuery,
  WorkflowTaskDispatch | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select(fields)
    .from(workflowTaskDispatch)
    .where(
      and(
        eq(workflowTaskDispatch.id, query.dispatchId),
        eq(workflowTaskDispatch.ownerId, query.ownerId),
        eq(workflowTaskDispatch.ownerEpoch, query.ownerEpoch),
        inArray(workflowTaskDispatch.status, [
          "CLAIMED",
          "RUNNING",
          "CANCELLING",
        ]),
        sql`${workflowTaskDispatch.ownerLeaseExpiresAt} > clock_timestamp()`,
      ),
    );
  return row ?? null;
};
