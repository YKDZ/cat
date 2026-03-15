import { eq, inArray, translatableElement, translatableString } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListElementsForDiffQuerySchema = z.object({
  elementIds: z.array(z.int()),
});

export type ListElementsForDiffQuery = z.infer<
  typeof ListElementsForDiffQuerySchema
>;

export type ElementForDiff = {
  id: number;
  text: string;
  meta: typeof translatableElement.$inferSelect.meta;
  sortIndex: number | null;
  sourceStartLine: number | null;
  sourceEndLine: number | null;
  sourceLocationMeta: typeof translatableElement.$inferSelect.sourceLocationMeta;
};

export const listElementsForDiff: Query<
  ListElementsForDiffQuery,
  ElementForDiff[]
> = async (ctx, query) => {
  if (query.elementIds.length === 0) {
    return [];
  }

  return ctx.db
    .select({
      id: translatableElement.id,
      text: translatableString.value,
      meta: translatableElement.meta,
      sortIndex: translatableElement.sortIndex,
      sourceStartLine: translatableElement.sourceStartLine,
      sourceEndLine: translatableElement.sourceEndLine,
      sourceLocationMeta: translatableElement.sourceLocationMeta,
    })
    .from(translatableElement)
    .innerJoin(
      translatableString,
      eq(translatableElement.translatableStringId, translatableString.id),
    )
    .where(inArray(translatableElement.id, query.elementIds))
    .orderBy(translatableElement.sortIndex);
};
