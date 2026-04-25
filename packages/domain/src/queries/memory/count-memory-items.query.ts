import { count, eq, memoryItem } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const CountMemoryItemsQuerySchema = z.object({
  memoryId: z.uuidv4(),
});

export type CountMemoryItemsQuery = z.infer<typeof CountMemoryItemsQuerySchema>;

export const countMemoryItems: Query<CountMemoryItemsQuery, number> = async (
  ctx,
  query,
) => {
  return assertSingleNonNullish(
    await ctx.db
      .select({ count: count() })
      .from(memoryItem)
      .where(eq(memoryItem.memoryId, query.memoryId))
      .limit(1),
  ).count;
};
