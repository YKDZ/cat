import { eq, recallDerivationState } from "@cat/db";
import { NormalizedLanguageIdSchema } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListTermRecallDerivationLanguagesQuerySchema = z.strictObject({});

export const listTermRecallDerivationLanguages: Query<
  z.infer<typeof ListTermRecallDerivationLanguagesQuerySchema>,
  string[]
> = async (ctx) => {
  const rows = await ctx.db
    .selectDistinct({ languageId: recallDerivationState.languageId })
    .from(recallDerivationState)
    .where(eq(recallDerivationState.targetKind, "TERM_CONCEPT"));
  return rows.map((row) => NormalizedLanguageIdSchema.parse(row.languageId));
};
