import { eq, getColumns, glossary } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListOwnedGlossariesQuerySchema = z.object({
  creatorId: z.uuidv4(),
});

export type ListOwnedGlossariesQuery = z.infer<
  typeof ListOwnedGlossariesQuerySchema
>;

export const listOwnedGlossaries: Query<
  ListOwnedGlossariesQuery,
  Array<typeof glossary.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select(getColumns(glossary))
    .from(glossary)
    .where(eq(glossary.creatorId, query.creatorId));
};
