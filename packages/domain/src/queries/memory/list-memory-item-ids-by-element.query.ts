import { and, eq, isNotNull, memoryItem } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListMemoryItemIdsByElementQuerySchema = z.object({
  elementId: z.int(),
});

export type ListMemoryItemIdsByElementQuery = z.infer<
  typeof ListMemoryItemIdsByElementQuerySchema
>;

/**
 * List all memory item UUIDs associated with a given element.
 *
 * @param ctx - Database query context
 * @param query - Query parameters (elementId)
 * @returns - Array of memoryItem.memoryId UUID strings
 */
export const listMemoryItemIdsByElement: Query<
  ListMemoryItemIdsByElementQuery,
  string[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ memoryId: memoryItem.memoryId })
    .from(memoryItem)
    .where(
      and(
        eq(memoryItem.sourceElementId, query.elementId),
        isNotNull(memoryItem.memoryId),
      ),
    );

  return rows.map((r) => r.memoryId);
};
