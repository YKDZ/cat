import { eq, getColumns, qaResultItem } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListQaResultItemsQuerySchema = z.object({
  qaResultId: z.int(),
});

export type ListQaResultItemsQuery = z.infer<
  typeof ListQaResultItemsQuerySchema
>;

export const listQaResultItems: Query<
  ListQaResultItemsQuery,
  Array<typeof qaResultItem.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select(getColumns(qaResultItem))
    .from(qaResultItem)
    .where(eq(qaResultItem.resultId, query.qaResultId));
};
