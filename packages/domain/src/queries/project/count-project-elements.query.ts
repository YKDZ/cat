import {
  and,
  contentRelation,
  count,
  eq,
  translatableElement,
  vectorizedString,
  type SQL,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/translation/build-translation-status-conditions";

export const CountProjectElementsQuerySchema = z.object({
  projectId: z.uuidv4(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});
export type CountProjectElementsQuery = z.infer<
  typeof CountProjectElementsQuerySchema
>;

/**
 * @zh 统计项目下满足条件的可翻译元素总数。
 * @en Count all translatable elements in a project matching the given filters.
 */
export const countProjectElements: Query<
  CountProjectElementsQuery,
  number
> = async (ctx, query) => {
  const whereConditions: SQL[] = [
    eq(translatableElement.projectId, query.projectId),
    eq(contentRelation.targetEndpointKind, "ELEMENT"),
    eq(contentRelation.isPrimary, true),
  ];

  whereConditions.push(
    ...buildTranslationStatusConditions(
      ctx.db,
      query.isTranslated,
      query.isApproved,
      query.languageId,
    ),
  );

  const rows = await ctx.db
    .select({ total: count() })
    .from(translatableElement)
    .innerJoin(
      contentRelation,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(and(...whereConditions));

  return rows[0]?.total ?? 0;
};
