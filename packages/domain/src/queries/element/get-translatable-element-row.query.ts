import { eq, getColumns, translatableElement } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

/**
 * Schema for fetching a full translatable-element row.
 */
export const GetTranslatableElementRowQuerySchema = z.object({
  elementId: z.int().positive(),
});

/**
 * Type for fetching a full translatable-element row.
 */
export type GetTranslatableElementRowQuery = z.infer<
  typeof GetTranslatableElementRowQuerySchema
>;

/**
 * Get the full `TranslatableElement` table row by element ID.
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
