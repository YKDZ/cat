import { eq, getColumns, qaResult } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListQaResultsByTranslationQuerySchema = z.object({
  translationId: z.int(),
});

export type ListQaResultsByTranslationQuery = z.infer<
  typeof ListQaResultsByTranslationQuerySchema
>;

export const listQaResultsByTranslation: Query<
  ListQaResultsByTranslationQuery,
  Array<typeof qaResult.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select(getColumns(qaResult))
    .from(qaResult)
    .where(eq(qaResult.translationId, query.translationId));
};
