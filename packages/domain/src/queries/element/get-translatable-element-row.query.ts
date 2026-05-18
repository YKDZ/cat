import { eq, getColumns, translatableElement } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

/**
 * @zh 获取完整可翻译元素行的查询 Schema。
 * @en Schema for fetching a full translatable-element row.
 */
export const GetTranslatableElementRowQuerySchema = z.object({
  elementId: z.int().positive(),
});

/**
 * @zh 获取完整可翻译元素行的查询类型。
 * @en Type for fetching a full translatable-element row.
 */
export type GetTranslatableElementRowQuery = z.infer<
  typeof GetTranslatableElementRowQuerySchema
>;

/**
 * @zh 根据元素 ID 获取完整的 `TranslatableElement` 表行。
 * @en Get the full `TranslatableElement` table row by element ID.
 */
export const getTranslatableElementRow: Query<
  GetTranslatableElementRowQuery,
  typeof translatableElement.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ ...getColumns(translatableElement) })
      .from(translatableElement)
      .where(eq(translatableElement.id, query.elementId))
      .limit(1),
  );
};
