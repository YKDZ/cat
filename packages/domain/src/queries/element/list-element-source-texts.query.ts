import { eq, inArray, translatableElement, vectorizedString } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListElementSourceTextsQuerySchema = z.object({
  elementIds: z.array(z.int()),
});

export type ListElementSourceTextsQuery = z.infer<
  typeof ListElementSourceTextsQuerySchema
>;

export type ElementSourceText = {
  id: number;
  text: string;
  sourceLanguageId: string;
};

/**
 * @zh 批量获取 element 的源文本（通过 vectorizedString join）。
 * @en Batch-fetch element source texts via the vectorizedString join.
 */
export const listElementSourceTexts: Query<
  ListElementSourceTextsQuery,
  ElementSourceText[]
> = async (ctx, query) => {
  if (query.elementIds.length === 0) return [];

  return ctx.db
    .select({
      id: translatableElement.id,
      text: vectorizedString.value,
      sourceLanguageId: vectorizedString.languageId,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(inArray(translatableElement.id, query.elementIds));
};
