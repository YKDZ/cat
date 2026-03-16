import { translatableString } from "@cat/db";
import { inArray } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListTranslatableStringsByIdQuerySchema = z.object({
  stringIds: z.array(z.int()),
});

export type ListTranslatableStringsByIdQuery = z.infer<
  typeof ListTranslatableStringsByIdQuerySchema
>;

export const listTranslatableStringsById: Query<
  ListTranslatableStringsByIdQuery,
  Array<typeof translatableString.$inferSelect>
> = async (ctx, query) => {
  if (query.stringIds.length === 0) {
    return [];
  }

  return ctx.db
    .select()
    .from(translatableString)
    .where(inArray(translatableString.id, query.stringIds));
};
