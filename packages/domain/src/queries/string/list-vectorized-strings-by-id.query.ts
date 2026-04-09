import { vectorizedString } from "@cat/db";
import { inArray } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListVectorizedStringsByIdQuerySchema = z.object({
  stringIds: z.array(z.int()),
});

export type ListVectorizedStringsByIdQuery = z.infer<
  typeof ListVectorizedStringsByIdQuerySchema
>;

export const listVectorizedStringsById: Query<
  ListVectorizedStringsByIdQuery,
  Array<typeof vectorizedString.$inferSelect>
> = async (ctx, query) => {
  if (query.stringIds.length === 0) {
    return [];
  }

  return ctx.db
    .select()
    .from(vectorizedString)
    .where(inArray(vectorizedString.id, query.stringIds));
};
