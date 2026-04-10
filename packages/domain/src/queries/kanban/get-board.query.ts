import { eq, getColumns, kanbanBoard } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetBoardQuerySchema = z.object({
  /** externalId (UUID) of the board */
  id: z.uuid(),
});

export type GetBoardQuery = z.infer<typeof GetBoardQuerySchema>;

export const getBoard: Query<
  GetBoardQuery,
  typeof kanbanBoard.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(kanbanBoard) })
      .from(kanbanBoard)
      .where(eq(kanbanBoard.externalId, query.id))
      .limit(1),
  );
};
