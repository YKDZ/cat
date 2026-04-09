import { eq, inArray, translatableElement, vectorizedString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListElementsQuerySchema = z.object({
  elementIds: z.array(z.int()),
});

export type ListElementsQuery = z.infer<typeof ListElementsQuerySchema>;

export type ElementWithString = {
  element: typeof translatableElement.$inferSelect;
  string: typeof vectorizedString.$inferSelect;
};

export const listElements: Query<
  ListElementsQuery,
  ElementWithString[]
> = async (ctx, query) => {
  if (query.elementIds.length === 0) {
    return [];
  }

  const rows = await ctx.db
    .select({
      element: translatableElement,
      string: vectorizedString,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(inArray(translatableElement.id, query.elementIds));

  return rows.map((row) => ({
    element: row.element,
    string: row.string,
  }));
};

export const ListElementsByDocumentQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type ListElementsByDocumentQuery = z.infer<
  typeof ListElementsByDocumentQuerySchema
>;

export const listElementsByDocument: Query<
  ListElementsByDocumentQuery,
  ElementWithString[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      element: translatableElement,
      string: vectorizedString,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(eq(translatableElement.documentId, query.documentId));

  return rows.map((row) => ({
    element: row.element,
    string: row.string,
  }));
};
