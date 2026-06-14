import {
  and,
  chunk,
  contentRelation,
  eq,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetElementWithChunkIdsQuerySchema = z.object({
  elementId: z.int(),
});
export type GetElementWithChunkIdsQuery = z.infer<
  typeof GetElementWithChunkIdsQuerySchema
>;

export type ElementWithChunkIds = {
  id: number;
  projectId: string;
  primaryContentNodeId: string | null;
  value: string;
  languageId: string;
  chunkIds: number[];
};

/**
 * Get a single element's source text and its chunk IDs (for vector recall).
 */
export const getElementWithChunkIds: Query<
  GetElementWithChunkIdsQuery,
  ElementWithChunkIds | null
> = async (ctx, query) => {
  // First get element + vectorized string
  const elementRows = await ctx.db
    .select({
      id: translatableElement.id,
      projectId: translatableElement.projectId,
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
      chunkSetId: vectorizedString.chunkSetId,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(eq(translatableElement.id, query.elementId))
    .limit(1);

  if (elementRows.length === 0) return null;

  const elementRow = elementRows[0];

  let chunkIds: number[] = [];
  if (elementRow.chunkSetId !== null) {
    const chunkRows = await ctx.db
      .select({ id: chunk.id })
      .from(chunk)
      .where(eq(chunk.chunkSetId, elementRow.chunkSetId));
    chunkIds = chunkRows.map((r) => r.id);
  }

  const primaryRows = await ctx.db
    .select({ sourceNodeId: contentRelation.sourceNodeId })
    .from(contentRelation)
    .where(
      and(
        eq(contentRelation.targetElementId, query.elementId),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.sourceEndpointKind, "NODE"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .limit(1);
  const primaryContentNodeId = primaryRows[0]?.sourceNodeId ?? null;

  return {
    id: elementRow.id,
    projectId: elementRow.projectId,
    primaryContentNodeId,
    value: elementRow.value,
    languageId: elementRow.languageId,
    chunkIds,
  };
};
