import { and, count, document, eq, translatableElement } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

import { buildTranslationStatusConditions } from "@/queries/document/build-translation-status-conditions";

export const CountProjectElementsQuerySchema = z.object({
  projectId: z.uuidv4(),
  isTranslated: z.boolean().optional(),
  isApproved: z.boolean().optional(),
  languageId: z.string().optional(),
});

export type CountProjectElementsQuery = z.infer<
  typeof CountProjectElementsQuerySchema
>;

export const countProjectElements: Query<
  CountProjectElementsQuery,
  number
> = async (ctx, query) => {
  const whereConditions = [eq(document.projectId, query.projectId)];
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
    .innerJoin(document, eq(translatableElement.documentId, document.id))
    .where(
      whereConditions.length === 1
        ? whereConditions[0]
        : and(...whereConditions),
    );

  return result[0]?.count ?? 0;
};
