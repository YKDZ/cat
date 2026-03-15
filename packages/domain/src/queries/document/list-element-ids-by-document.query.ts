import { eq, translatableElement } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListElementIdsByDocumentQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type ListElementIdsByDocumentQuery = z.infer<
  typeof ListElementIdsByDocumentQuerySchema
>;

export const listElementIdsByDocument: Query<
  ListElementIdsByDocumentQuery,
  number[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: translatableElement.id })
    .from(translatableElement)
    .where(eq(translatableElement.documentId, query.documentId));

  return rows.map((row) => row.id);
};
