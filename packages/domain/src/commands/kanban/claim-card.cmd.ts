import { sql } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const ClaimCardCommandSchema = z.object({
  boardId: z.int().positive(),
  /** Agent definition ID that is claiming the card */
  agentId: z.int().positive().optional(),
  /** User ID that is claiming the card */
  userId: z.uuid().optional(),
  /** Which statuses are claimable (defaults to OPEN and NEEDS_REWORK) */
  claimableStatuses: z
    .array(z.enum(["OPEN", "NEEDS_REWORK"]))
    .default(["OPEN", "NEEDS_REWORK"]),
});

export type ClaimCardCommand = z.infer<typeof ClaimCardCommandSchema>;

export type ClaimCardResult = {
  id: number;
  externalId: string;
  title: string;
  linkedResourceType: string | null;
  linkedResourceId: string | null;
} | null;

/**
 * @zh 原子性地从看板领取一张可用卡片（FOR UPDATE SKIP LOCKED）。
 * @en Atomically claim an available kanban card using FOR UPDATE SKIP LOCKED.
 *
 * Returns null if no claimable card is available.
 */
export const claimCard: Command<ClaimCardCommand, ClaimCardResult> = async (
  ctx,
  command,
) => {
  const claimedBy = command.agentId
    ? `agent:${command.agentId}`
    : command.userId
      ? `user:${command.userId}`
      : "unknown";

  const now = new Date();

  // Use raw SQL for SELECT ... FOR UPDATE SKIP LOCKED to atomically pick one row
  const rows = await ctx.db.execute<{
    id: number;
    external_id: string;
    title: string;
    linked_resource_type: string | null;
    linked_resource_id: string | null;
  }>(sql`
    UPDATE "KanbanCard"
    SET
      status = 'CLAIMED',
      claimed_at = ${now},
      claimed_by = ${claimedBy},
      assignee_agent_id = ${command.agentId ?? null},
      assignee_user_id = ${command.userId ?? null},
      updated_at = ${now}
    WHERE id = (
      SELECT id FROM "KanbanCard"
      WHERE board_id = ${command.boardId}
        AND status = ANY(${sql`ARRAY[${sql.join(
          command.claimableStatuses.map((s) => sql`${s}`),
          sql`, `,
        )}]::text[]`})
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, external_id, title, linked_resource_type, linked_resource_id
  `);

  if (!rows.rows || rows.rows.length === 0) {
    return { result: null, events: [] };
  }

  const row = rows.rows[0];
  return {
    result: {
      id: row.id,
      externalId: row.external_id,
      title: row.title,
      linkedResourceType: row.linked_resource_type,
      linkedResourceId: row.linked_resource_id,
    },
    events: [],
  };
};
