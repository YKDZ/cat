import { glossary } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListAllGlossariesQuerySchema = z.object({});

export type ListAllGlossariesQuery = z.infer<
  typeof ListAllGlossariesQuerySchema
>;

export const listAllGlossaries: Query<
  ListAllGlossariesQuery,
  Array<typeof glossary.$inferSelect>
> = async (ctx, _query) => {
  return ctx.db.select().from(glossary);
};
