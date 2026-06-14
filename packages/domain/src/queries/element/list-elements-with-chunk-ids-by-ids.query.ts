import {
  and,
  chunk,
  contentRelation,
  eq,
  inArray,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

/**
 * Schema for bulk element detail queries.
 */
export const ListElementsWithChunkIdsByIdsQuerySchema = z.object({
  elementIds: z.array(z.int().positive()).max(5000),
});

/**
 * Type for bulk element detail queries.
 */
export type ListElementsWithChunkIdsByIdsQuery = z.infer<
  typeof ListElementsWithChunkIdsByIdsQuerySchema
>;

/**
 * Element detail with chunk metadata.
 */
export type ElementWithChunkIdsById = {
  id: number;
  projectId: string;
  primaryContentNodeId: string | null;
  value: string;
  languageId: string;
  chunkIds: number[];
};

/**
 * Batch-fetch element source text, project, primary content node, and chunk ids.
 */
export const listElementsWithChunkIdsByIds: Query<
  ListElementsWithChunkIdsByIdsQuery,
  ElementWithChunkIdsById[]
> = async (ctx, query) => {
  if (query.elementIds.length === 0) return [];

  const elementRows = await ctx.db
    .select({
      id: translatableElement.id,
      projectId: translatableElement.projectId,
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
      chunkSetId: vectorizedString.chunkSetId,
      primaryContentNodeId: contentRelation.sourceNodeId,
    })
    .from(translatableElement)
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
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
    .where(inArray(translatableElement.id, query.elementIds));

  const chunkSetIds = elementRows
    .map((row) => row.chunkSetId)
    .filter((id): id is number => id !== null);
  const chunkMap = new Map<number, number[]>();

  if (chunkSetIds.length > 0) {
    const chunkRows = await ctx.db
      .select({ id: chunk.id, chunkSetId: chunk.chunkSetId })
      .from(chunk)
      .where(inArray(chunk.chunkSetId, chunkSetIds));

    for (const row of chunkRows) {
      const ids = chunkMap.get(row.chunkSetId) ?? [];
      ids.push(row.id);
      chunkMap.set(row.chunkSetId, ids);
    }
  }

  return elementRows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    primaryContentNodeId: row.primaryContentNodeId,
    value: row.value,
    languageId: row.languageId,
    chunkIds:
      row.chunkSetId !== null ? (chunkMap.get(row.chunkSetId) ?? []) : [],
  }));
};
