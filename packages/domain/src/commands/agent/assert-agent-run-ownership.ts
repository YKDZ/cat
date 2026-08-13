import { agentRun, and, eq, or, sql } from "@cat/db";

import type { DbHandle, OperationOwnershipFence } from "#/types.ts";

export const assertActiveAgentRunOwnership = async (
  db: DbHandle,
  fence: OperationOwnershipFence,
): Promise<number> => {
  const [owner] = await db
    .select({ id: agentRun.id })
    .from(agentRun)
    .where(
      and(
        eq(agentRun.externalId, fence.runId),
        eq(agentRun.ownerId, fence.ownerId),
        eq(agentRun.ownerEpoch, fence.epoch),
        or(eq(agentRun.status, "running"), eq(agentRun.status, "paused")),
        sql`${agentRun.ownerLeaseExpiresAt} > clock_timestamp()`,
      ),
    )
    .for("update");
  if (!owner) throw new Error("Workflow owner lease lost.");
  return owner.id;
};
