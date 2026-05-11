import type { JSONType } from "@cat/shared";

import { eq, inArray, translatableElement, vectorizedString } from "@cat/db";
import * as z from "zod";

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
  meta: JSONType | null;
  sortIndex: number | null;
  sourceStartLine: number | null;
  sourceEndLine: number | null;
  sourceLocationMeta: JSONType | null;
};

/**
 * @zh 根据 element ID 列表批量获取 diff 视图所需的元素信息。
 * @en Get element data for diff display by a list of element IDs.
 */
export const listElementsForDiff: Query<
  ListElementsForDiffQuery,
  ElementForDiff[]
> = async (ctx, query) => {
  if (query.elementIds.length === 0) return [];

  const rows = await ctx.db
    .select({
      id: translatableElement.id,
      text: vectorizedString.value,
      meta: translatableElement.meta,
      sourceStartLine: translatableElement.sourceStartLine,
      sourceEndLine: translatableElement.sourceEndLine,
      sourceLocationMeta: translatableElement.sourceLocationMeta,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(inArray(translatableElement.id, query.elementIds));

  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    meta: r.meta ?? null,
    sortIndex: null,
    sourceStartLine: r.sourceStartLine ?? null,
    sourceEndLine: r.sourceEndLine ?? null,
    sourceLocationMeta: r.sourceLocationMeta ?? null,
  }));
};
