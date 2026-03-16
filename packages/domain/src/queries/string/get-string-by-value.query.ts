import { translatableString } from "@cat/db";
import { eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetStringByValueQuerySchema = z.object({
  value: z.string(),
  languageId: z.string(),
});

export type GetStringByValueQuery = z.infer<typeof GetStringByValueQuerySchema>;

export const getStringByValue: Query<
  GetStringByValueQuery,
  typeof translatableString.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(translatableString)
    .where(eq(translatableString.value, query.value))
    .limit(1);

  return rows[0] ?? null;
};
