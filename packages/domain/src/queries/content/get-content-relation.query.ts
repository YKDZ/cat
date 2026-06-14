import { contentRelation, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetContentRelationQuerySchema = z.object({
  id: z.uuidv4(),
});
export type GetContentRelationQuery = z.infer<
  typeof GetContentRelationQuerySchema
>;

/**
 * Fetch a single ContentRelation row by ID.
 */
export const getContentRelation: Query<
  GetContentRelationQuery,
  typeof contentRelation.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(contentRelation)
    .where(eq(contentRelation.id, query.id))
    .limit(1);
  return rows[0] ?? null;
};
