import { sql } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const ClaimIssueCommandSchema = z.object({
  projectId: z.uuid(),
  /** User ID claiming the issue */
  userId: z.uuid().optional(),
  /** Agent ID claiming the issue */
  agentId: z.int().positive().optional(),
});

export type ClaimIssueCommand = z.infer<typeof ClaimIssueCommandSchema>;

export type ClaimIssueResult = {
  id: number;
  externalId: string;
  title: string;
  number: number;
} | null;

/**
 * @zh 原子性地接取项目内首个符合 claimPolicy 的 OPEN Issue（FOR UPDATE SKIP LOCKED）。
 * @en Atomically claims the first OPEN issue matching claimPolicy in the project (FOR UPDATE SKIP LOCKED).
 *
 * Returns null if no claimable issue is available.
 */
export const claimIssue: Command<ClaimIssueCommand, ClaimIssueResult> = async (
  ctx,
  command,
) => {
  const claimedBy = command.agentId
    ? `agent:${command.agentId}`
    : command.userId
      ? `user:${command.userId}`
      : "unknown";

  const now = new Date();

  const rows = await ctx.db.execute<{
    id: number;
    external_id: string;
    title: string;
    number: number;
  }>(sql`
    UPDATE "Issue"
    SET
      status = 'CLOSED',
      "closed_at" = ${now},
      "updated_at" = ${now}
    WHERE id = (
      SELECT id FROM "Issue"
      WHERE "project_id" = ${command.projectId}::uuid
        AND status = 'OPEN'::"IssueStatus"
        AND (
          "claim_policy" IS NULL
          OR ${command.userId !== undefined ? sql`"claim_policy"->'rules' @> ${JSON.stringify([{ type: "user", id: command.userId }])}::jsonb` : sql`FALSE`}
          OR ${command.agentId !== undefined ? sql`"claim_policy"->'rules' @> ${JSON.stringify([{ type: "agent", id: String(command.agentId) }])}::jsonb` : sql`FALSE`}
        )
      ORDER BY "created_at" ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, "external_id", title, number
  `);

  const row = rows.rows[0];
  if (!row) {
    return { result: null, events: [] };
  }

  return {
    result: {
      id: row.id,
      externalId: row.external_id,
      title: row.title,
      number: row.number,
    },
    events: [
      domainEvent("issue:claimed", {
        issueId: row.id,
        claimedBy,
      }),
    ],
  };
};
