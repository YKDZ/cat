import { and, asc, desc, eq, getColumns, inArray, kanbanCard } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetClaimableCardQuerySchema = z.object({
  boardId: z.int().positive(),
  columnId: z.string().optional(),
});

export type GetClaimableCardQuery = z.infer<typeof GetClaimableCardQuerySchema>;

/**
 * @zh 返回看板中第一张可领取的卡片（状态为 OPEN 或 NEEDS_REWORK），按优先级降序、创建时间升序排列。
 * @en Returns the first claimable card (status OPEN or NEEDS_REWORK) sorted by priority DESC, createdAt ASC.
 * This is a "peek" query — the actual atomic claim uses claim-card.cmd with FOR UPDATE SKIP LOCKED.
 */
export const getClaimableCard: Query<
  GetClaimableCardQuery,
  typeof kanbanCard.$inferSelect | null
> = async (ctx, query) => {
  const conditions = [
    eq(kanbanCard.boardId, query.boardId),
    inArray(kanbanCard.status, ["OPEN", "NEEDS_REWORK"]),
  ];
  if (query.columnId) {
    conditions.push(eq(kanbanCard.columnId, query.columnId));
  }

  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(kanbanCard) })
      .from(kanbanCard)
      .where(and(...conditions))
      .orderBy(desc(kanbanCard.priority), asc(kanbanCard.createdAt))
      .limit(1),
  );
};
