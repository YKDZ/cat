import { eq, language } from "@cat/db";
import { assertFirstOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetLanguageQuerySchema = z.object({
  languageId: z.string(),
});

export type GetLanguageQuery = z.infer<typeof GetLanguageQuerySchema>;

export const getLanguage: Query<
  GetLanguageQuery,
  typeof language.$inferSelect | null
> = async (ctx, query) => {
  return assertFirstOrNull(
    await ctx.db
      .select()
      .from(language)
      .where(eq(language.id, query.languageId)),
  );
};
