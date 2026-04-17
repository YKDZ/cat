import { sql } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const AllocateNumberCommandSchema = z.object({
  projectId: z.uuid(),
});

export type AllocateNumberCommand = z.infer<typeof AllocateNumberCommandSchema>;

/**
 * @zh 原子递增 project_sequence 并返回分配的序号。如果 projectId 尚无记录则自动初始化。
 * @en Atomically increments the project_sequence and returns the allocated number.
 * Auto-initializes if no record exists for the given projectId.
 */
export const allocateNumber: Command<AllocateNumberCommand, number> = async (
  ctx,
  command,
) => {
  const rows = await ctx.db.execute<{ allocated: number }>(sql`
    INSERT INTO "ProjectSequence" ("project_id", "next_value")
    VALUES (${command.projectId}, 2)
    ON CONFLICT ("project_id")
    DO UPDATE SET "next_value" = "ProjectSequence"."next_value" + 1
    RETURNING "next_value" - 1 AS allocated
  `);

  const allocated = rows.rows[0]?.allocated;
  if (allocated === undefined) {
    throw new Error("Failed to allocate sequence number");
  }

  return { result: Number(allocated), events: [] };
};
