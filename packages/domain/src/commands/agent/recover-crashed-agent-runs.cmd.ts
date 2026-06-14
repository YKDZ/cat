import { agentEvent, agentRun, and, eq, sql } from "@cat/db";
import { createHash } from "node:crypto";
import * as z from "zod";

import type { Command } from "@/types";

const DEFAULT_CRASH_RECOVERY_REASON =
  "Process exited while run was active" as const;

/**
 * Input for the crashed workflow recovery command.
 */
export const RecoverCrashedAgentRunsCommandSchema = z.object({
  /**
   * External IDs of runs still owned by the current process and excluded from recovery.
   */
  activeRunIds: z.array(z.uuidv4()).optional(),
  /**
   * Timestamp of the recovery operation, defaults to the current time.
   */
  recoveredAt: z.date().optional(),
  /**
   * Error reason written into the `run:error` event.
   */
  reason: z.string().min(1).default(DEFAULT_CRASH_RECOVERY_REASON),
});

/**
 * Input type for the crashed workflow recovery command.
 */
export type RecoverCrashedAgentRunsCommand = z.input<
  typeof RecoverCrashedAgentRunsCommandSchema
>;

/**
 * Result of crashed workflow recovery.
 */
export type RecoverCrashedAgentRunsResult = {
  /** External IDs of runs recovered by the command */
  recoveredRunIds: string[];
};

/**
 * Generate a stable crash-recovery event ID for the given run.
 *
 * @param runId - External ID of the agent run
 * @returns - Stable UUID v4 event ID
 */
export const createCrashRecoveryEventId = (runId: string): string => {
  const bytes = createHash("sha256")
    .update(`crash-recovery:${runId}`)
    .digest()
    .subarray(0, 16);

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16,
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

/**
 * Converge persisted `running` runs not owned by the current process into `failed` and backfill a stable crash error event.
 *
 * @param ctx - Command execution context
 * @param command - Recovery input parameters
 * @returns - List of recovered run IDs
 */
export const recoverCrashedAgentRuns: Command<
  RecoverCrashedAgentRunsCommand,
  RecoverCrashedAgentRunsResult
> = async (ctx, command) => {
  const activeRunIds = new Set(command.activeRunIds ?? []);
  const recoveredAt = command.recoveredAt ?? new Date();
  const reason = command.reason ?? DEFAULT_CRASH_RECOVERY_REASON;

  const recoveredRunIds = await ctx.db.transaction(async (tx) => {
    const candidates = await tx.execute<{
      id: number;
      external_id: string;
    }>(sql`
      SELECT id, external_id
      FROM "AgentRun"
      WHERE status = 'running'
      ORDER BY id ASC
      FOR UPDATE
    `);

    const ids: string[] = [];

    for (const row of candidates.rows) {
      if (activeRunIds.has(row.external_id)) continue;

      // oxlint-disable-next-line no-await-in-loop -- each recovered run must keep event insert and state transition ordered inside the transaction
      await tx
        .insert(agentEvent)
        .values({
          runId: row.id,
          eventId: createCrashRecoveryEventId(row.external_id),
          type: "run:error",
          payload: { error: reason },
          timestamp: recoveredAt,
        })
        .onConflictDoNothing();

      // oxlint-disable-next-line no-await-in-loop -- each recovered run updates exactly one locked row before moving to the next
      await tx
        .update(agentRun)
        .set({
          status: "failed",
          completedAt: recoveredAt,
          currentNodeId: null,
        })
        .where(and(eq(agentRun.id, row.id), eq(agentRun.status, "running")));

      ids.push(row.external_id);
    }

    return ids;
  });

  return { result: { recoveredRunIds }, events: [] };
};
