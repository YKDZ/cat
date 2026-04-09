import { vectorizedString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAllVectorizedStringsQuerySchema = z.object();

export type ListAllVectorizedStringsQuery = z.infer<
  typeof ListAllVectorizedStringsQuerySchema
>;

export const listAllVectorizedStrings: Query<
  ListAllVectorizedStringsQuery,
  Array<typeof vectorizedString.$inferSelect>
> = async (ctx, _) => {
  return ctx.db.select().from(vectorizedString);
};
