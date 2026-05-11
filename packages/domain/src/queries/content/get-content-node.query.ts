import { contentNode, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetContentNodeQuerySchema = z.object({ id: z.uuidv4() });
export type GetContentNodeQuery = z.infer<typeof GetContentNodeQuerySchema>;

export const getContentNode: Query<
  GetContentNodeQuery,
  typeof contentNode.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(contentNode)
    .where(eq(contentNode.id, query.id))
    .limit(1);
  return rows[0] ?? null;
};
