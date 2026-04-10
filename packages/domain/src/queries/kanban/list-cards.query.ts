import { and, eq, getColumns, kanbanCard, type SQL } from "@cat/db";
import { KanbanCardStatusSchema } from "@cat/shared/schema/enum";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListCardsQuerySchema = z.object({
  boardId: z.int().positive(),
  status: KanbanCardStatusSchema.optional(),
  columnId: z.string().optional(),
});

export type ListCardsQuery = z.infer<typeof ListCardsQuerySchema>;

export const listCards: Query<
  ListCardsQuery,
  (typeof kanbanCard.$inferSelect)[]
> = async (ctx, query) => {
  const conditions: SQL[] = [eq(kanbanCard.boardId, query.boardId)];

  if (query.status) {
    conditions.push(eq(kanbanCard.status, query.status));
  }
  if (query.columnId) {
    conditions.push(eq(kanbanCard.columnId, query.columnId));
  }

  return ctx.db
    .select({ ...getColumns(kanbanCard) })
    .from(kanbanCard)
    .where(and(...conditions));
};
