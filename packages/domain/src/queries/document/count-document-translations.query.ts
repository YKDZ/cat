import {
  and,
  count,
  eq,
  isNotNull,
  translation,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const CountDocumentTranslationsQuerySchema = z.object({
  documentId: z.uuidv4(),
  languageId: z.string(),
  isApproved: z.boolean().optional(),
});

export type CountDocumentTranslationsQuery = z.infer<
  typeof CountDocumentTranslationsQuerySchema
>;

export const countDocumentTranslations: Query<
  CountDocumentTranslationsQuery,
  number
> = async (ctx, query) => {
  const result = await ctx.db
    .select({ count: count() })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translation.translatableElementId, translatableElement.id),
    )
    .innerJoin(vectorizedString, eq(vectorizedString.id, translation.stringId))
    .where(
      and(
        eq(translatableElement.documentId, query.documentId),
        eq(vectorizedString.languageId, query.languageId),
        query.isApproved
          ? isNotNull(translatableElement.approvedTranslationId)
          : undefined,
      ),
    );

  return result[0]?.count ?? 0;
};
