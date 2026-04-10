import { eq, getColumns, kanbanCard } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetCardQuerySchema = z.object({
  /** externalId (UUID) of the card */
  id: z.uuid(),
});

export type GetCardQuery = z.infer<typeof GetCardQuerySchema>;

export const getCard: Query<
  GetCardQuery,
  typeof kanbanCard.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(kanbanCard) })
      .from(kanbanCard)
      .where(eq(kanbanCard.externalId, query.id))
      .limit(1),
  );
};
