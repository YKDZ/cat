import {
  and,
  asc,
  contentRelation,
  count,
  eq,
  ilike,
  lt,
  or,
  translatableElement,
  vectorizedString,
  type SQL,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/translation/build-translation-status-conditions";

export const GetContentNodeElementPageIndexQuerySchema = z.object({
  elementId: z.int(),
  pageSize: z.int().default(16),
  searchQuery: z.string().default("").optional(),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});
export type GetContentNodeElementPageIndexQuery = z.infer<
  typeof GetContentNodeElementPageIndexQuerySchema
>;

/**
 * @zh 获取元素在内容节点元素列表中的页码（基于 localOrder 排序）。
 * @en Get the page index of an element within its content node's element list (ordered by localOrder).
 */
export const getContentNodeElementPageIndex: Query<
  GetContentNodeElementPageIndexQuery,
  number
> = async (ctx, query) => {
  // Find the element's content relation to get its localOrder and contentNodeId
  const elementRelation = await ctx.db
    .select({
      localOrder: contentRelation.localOrder,
      contentNodeId: contentRelation.sourceNodeId,
    })
    .from(contentRelation)
    .where(
      and(
        eq(contentRelation.targetElementId, query.elementId),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .limit(1);

  if (!elementRelation[0]) return 0;

  const { localOrder, contentNodeId } = elementRelation[0];
  if (!contentNodeId) return 0;

  const whereConditions: SQL[] = [
    eq(contentRelation.sourceNodeId, contentNodeId),
    eq(contentRelation.targetEndpointKind, "ELEMENT"),
    eq(contentRelation.isPrimary, true),
    // Elements that come before this one in the ordering
    or(
      lt(contentRelation.localOrder, localOrder ?? 0),
      and(
        eq(contentRelation.localOrder, localOrder ?? 0),
        lt(translatableElement.id, query.elementId),
      ),
    )!,
  ];

  if (query.searchQuery && query.searchQuery.trim().length > 0) {
    whereConditions.push(
      ilike(vectorizedString.value, `%${query.searchQuery}%`),
    );
  }

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
    .from(contentRelation)
    .innerJoin(
      translatableElement,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(and(...whereConditions))
    .orderBy(asc(contentRelation.localOrder), asc(translatableElement.id));

  const position = rows[0]?.total ?? 0;
  return Math.floor(position / query.pageSize);
};
