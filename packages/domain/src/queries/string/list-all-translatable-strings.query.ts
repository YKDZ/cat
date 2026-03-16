import { translatableString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAllTranslatableStringsQuerySchema = z.object();

export type ListAllTranslatableStringsQuery = z.infer<
  typeof ListAllTranslatableStringsQuerySchema
>;

export const listAllTranslatableStrings: Query<
  ListAllTranslatableStringsQuery,
  Array<typeof translatableString.$inferSelect>
> = async (ctx, _) => {
  return ctx.db.select().from(translatableString);
};
