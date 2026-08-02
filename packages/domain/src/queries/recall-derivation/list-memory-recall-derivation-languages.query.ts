import { eq, recallDerivationState } from "@cat/db";
import { NormalizedLanguageIdSchema } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const ListMemoryRecallDerivationLanguagesQuerySchema = z.strictObject(
  {},
);

export const listMemoryRecallDerivationLanguages: Query<
  z.infer<typeof ListMemoryRecallDerivationLanguagesQuerySchema>,
  string[]
> = async (ctx) => {
  const rows = await ctx.db
    .selectDistinct({ languageId: recallDerivationState.languageId })
    .from(recallDerivationState)
    .where(eq(recallDerivationState.targetKind, "MEMORY_ITEM"));
  return rows.map((row) => NormalizedLanguageIdSchema.parse(row.languageId));
};
