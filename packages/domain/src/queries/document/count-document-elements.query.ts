import {
  and,
  count,
  eq,
  ilike,
  translatableElement,
  translatableString,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/document/build-translation-status-conditions";

export const CountDocumentElementsQuerySchema = z.object({
  documentId: z.uuidv4(),
  searchQuery: z.string().default(""),
  isApproved: z.boolean().optional(),
  isTranslated: z.boolean().optional(),
  languageId: z.string().optional(),
});

export type CountDocumentElementsQuery = z.infer<
  typeof CountDocumentElementsQuerySchema
>;

export const countDocumentElements: Query<
  CountDocumentElementsQuery,
  number
> = async (ctx, query) => {
  const whereConditions = [
    eq(translatableElement.documentId, query.documentId),
  ];

  if (query.searchQuery.trim().length > 0) {
    whereConditions.push(
      ilike(translatableString.value, `%${query.searchQuery}%`),
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
      translatableString,
      eq(translatableElement.translatableStringId, translatableString.id),
    )
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : and(...whereConditions),
    );

  return result[0]?.count ?? 0;
};
