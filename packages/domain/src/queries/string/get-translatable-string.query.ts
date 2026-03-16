import { translatableString } from "@cat/db";
import { eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetTranslatableStringQuerySchema = z.object({
  stringId: z.int(),
});

export type GetTranslatableStringQuery = z.infer<
  typeof GetTranslatableStringQuerySchema
>;

export const getTranslatableString: Query<
  GetTranslatableStringQuery,
  typeof translatableString.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(translatableString)
    .where(eq(translatableString.id, query.stringId))
    .limit(1);

  return rows[0] ?? null;
};
