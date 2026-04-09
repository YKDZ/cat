import { vectorizedString } from "@cat/db";
import { eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetVectorizedStringQuerySchema = z.object({
  stringId: z.int(),
});

export type GetVectorizedStringQuery = z.infer<
  typeof GetVectorizedStringQuerySchema
>;

export const getVectorizedString: Query<
  GetVectorizedStringQuery,
  typeof vectorizedString.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(vectorizedString)
    .where(eq(vectorizedString.id, query.stringId))
    .limit(1);

  return rows[0] ?? null;
};
