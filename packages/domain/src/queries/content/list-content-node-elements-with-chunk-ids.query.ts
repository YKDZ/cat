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

export const ListContentNodeElementsWithChunkIdsQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
});

export type ListContentNodeElementsWithChunkIdsQuery = z.infer<
  typeof ListContentNodeElementsWithChunkIdsQuerySchema
>;

export type ContentNodeElementWithChunkIds = {
  id: number;
  value: string;
  languageId: string;
  chunkIds: number[];
};

/**
 * Get all elements under a content node along with their chunk IDs (for batch auto-translation).
 */
export const listContentNodeElementsWithChunkIds: Query<
  ListContentNodeElementsWithChunkIdsQuery,
  ContentNodeElementWithChunkIds[]
> = async (ctx, query) => {
  const elementRows = await ctx.db
    .select({
      id: translatableElement.id,
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
      chunkSetId: vectorizedString.chunkSetId,
    })
    .from(contentRelation)
    .innerJoin(
      translatableElement,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .where(
      and(
        eq(contentRelation.sourceNodeId, query.contentNodeId),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.isPrimary, true),
      ),
    );

  if (elementRows.length === 0) return [];

  // Collect all non-null chunkSetIds
  const chunkSetIds = elementRows
    .map((r) => r.chunkSetId)
    .filter((id): id is number => id !== null);

  // Fetch all chunk IDs for those chunk sets in one query
  const chunkMap = new Map<number, number[]>();
  if (chunkSetIds.length > 0) {
    const chunkRows = await ctx.db
      .select({ id: chunk.id, chunkSetId: chunk.chunkSetId })
      .from(chunk)
      .where(inArray(chunk.chunkSetId, chunkSetIds));

    for (const row of chunkRows) {
      const existing = chunkMap.get(row.chunkSetId) ?? [];
      existing.push(row.id);
      chunkMap.set(row.chunkSetId, existing);
    }
  }

  return elementRows.map((r) => ({
    id: r.id,
    value: r.value,
    languageId: r.languageId,
    chunkIds: r.chunkSetId !== null ? (chunkMap.get(r.chunkSetId) ?? []) : [],
  }));
};
