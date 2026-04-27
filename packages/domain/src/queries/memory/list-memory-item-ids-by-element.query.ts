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
 * @zh 查询与指定元素关联的所有记忆条目的 UUID 列表。
 * @en List all memory item UUIDs associated with a given element.
 *
 * @param ctx - {@zh 数据库查询上下文} {@en Database query context}
 * @param query - {@zh 查询参数（elementId）} {@en Query parameters (elementId)}
 * @returns - {@zh memoryItem.memoryId 的 UUID 字符串数组} {@en Array of memoryItem.memoryId UUID strings}
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
