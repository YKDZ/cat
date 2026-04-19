import {
  and,
  count,
  eq,
  ilike,
  lt,
  or,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/document/build-translation-status-conditions";

export const GetDocumentElementPageIndexQuerySchema = z.object({
  elementId: z.int(),
  pageSize: z.int().min(1).default(16),
  searchQuery: z.string().default(""),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});

export type GetDocumentElementPageIndexQuery = z.infer<
  typeof GetDocumentElementPageIndexQuerySchema
>;

export const getDocumentElementPageIndex: Query<
  GetDocumentElementPageIndexQuery,
  number
> = async (ctx, query) => {
  const target = assertSingleNonNullish(
    await ctx.db
      .select({
        sortIndex: translatableElement.sortIndex,
        documentId: translatableElement.documentId,
      })
      .from(translatableElement)
      .where(eq(translatableElement.id, query.elementId)),
    `Element ${query.elementId} with given id does not exists`,
  );

  const targetSortIndex = target.sortIndex ?? 0;
  const whereConditions = [
    eq(translatableElement.documentId, target.documentId),
    or(
      lt(translatableElement.sortIndex, targetSortIndex),
      and(
        eq(translatableElement.sortIndex, targetSortIndex),
        lt(translatableElement.id, query.elementId),
      ),
    )!,
  ];

  if (query.searchQuery.trim().length > 0) {
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

  const result = await ctx.db
    .select({ count: count() })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : and(...whereConditions),
    );

  return Math.floor((result[0]?.count ?? 0) / query.pageSize);
};
