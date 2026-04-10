import { and, eq, getColumns, kanbanBoard, type SQL } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListBoardsQuerySchema = z.object({
  orgId: z.uuid().optional(),
  linkedResourceType: z.string().optional(),
  linkedResourceId: z.string().optional(),
});

export type ListBoardsQuery = z.infer<typeof ListBoardsQuerySchema>;

export const listBoards: Query<
  ListBoardsQuery,
  (typeof kanbanBoard.$inferSelect)[]
> = async (ctx, query) => {
  const conditions: SQL[] = [];

  if (query.orgId) {
    conditions.push(eq(kanbanBoard.orgId, query.orgId));
  }
  if (query.linkedResourceType && query.linkedResourceId) {
    conditions.push(
      eq(kanbanBoard.linkedResourceType, query.linkedResourceType),
    );
    conditions.push(eq(kanbanBoard.linkedResourceId, query.linkedResourceId));
  }

  return ctx.db
    .select({ ...getColumns(kanbanBoard) })
    .from(kanbanBoard)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
};
