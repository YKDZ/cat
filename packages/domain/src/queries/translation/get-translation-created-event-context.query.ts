import {
  and,
  contentRelation,
  eq,
  inArray,
  translatableElement,
  translation,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetTranslationCreatedEventContextQuerySchema = z.object({
  translationIds: z.array(z.int()),
});
export type GetTranslationCreatedEventContextQuery = z.infer<
  typeof GetTranslationCreatedEventContextQuerySchema
>;

/**
 * Context payload for translation-created events.
 */
export type TranslationCreatedEventContext = {
  projectId: string;
  translationIds: number[];
  elementIds: number[];
  primaryContentNodeIds: string[];
};

/**
 * Resolve project, element, and primary content-node context for translation ids.
 *
 * @param ctx - Query context
 * @param query - Translation-id query input
 * @returns - Translation-created event context grouped by project
 */
export const getTranslationCreatedEventContext: Query<
  GetTranslationCreatedEventContextQuery,
  TranslationCreatedEventContext[]
> = async (ctx, query) => {
  if (query.translationIds.length === 0) return [];

  const rows = await ctx.db
    .select({
      translationId: translation.id,
      elementId: translatableElement.id,
      projectId: translatableElement.projectId,
      primaryContentNodeId: contentRelation.sourceNodeId,
    })
    .from(translation)
    .innerJoin(
      translatableElement,
      eq(translatableElement.id, translation.translatableElementId),
    )
    .leftJoin(
      contentRelation,
      and(
        eq(contentRelation.targetElementId, translatableElement.id),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.sourceEndpointKind, "NODE"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .where(inArray(translation.id, query.translationIds));

  const byProject = new Map<
    string,
    {
      translationIds: Set<number>;
      elementIds: Set<number>;
      primaryContentNodeIds: Set<string>;
    }
  >();

  for (const row of rows) {
    const bucket = byProject.get(row.projectId) ?? {
      translationIds: new Set<number>(),
      elementIds: new Set<number>(),
      primaryContentNodeIds: new Set<string>(),
    };
    bucket.translationIds.add(row.translationId);
    bucket.elementIds.add(row.elementId);
    if (row.primaryContentNodeId !== null) {
      bucket.primaryContentNodeIds.add(row.primaryContentNodeId);
    }
    byProject.set(row.projectId, bucket);
  }

  return [...byProject.entries()].map(([projectId, value]) => ({
    projectId,
    translationIds: [...value.translationIds],
    elementIds: [...value.elementIds],
    primaryContentNodeIds: [...value.primaryContentNodeIds],
  }));
};
