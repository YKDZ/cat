import { eq, translatableElement } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetElementProjectQuerySchema = z.object({
  elementId: z.int(),
});
export type GetElementProjectQuery = z.infer<
  typeof GetElementProjectQuerySchema
>;

/**
 * Get the projectId the element belongs to (directly from translatableElement table).
 */
export const getElementProject: Query<
  GetElementProjectQuery,
  { projectId: string } | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ projectId: translatableElement.projectId })
    .from(translatableElement)
    .where(eq(translatableElement.id, query.elementId))
    .limit(1);
  return rows[0] ?? null;
};
