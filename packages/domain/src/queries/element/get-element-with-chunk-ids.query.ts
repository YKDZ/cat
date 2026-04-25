import {
  chunk,
  chunkSet,
  document,
  eq,
  sql,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetElementWithChunkIdsQuerySchema = z.object({
  elementId: z.int(),
});

export type GetElementWithChunkIdsQuery = z.infer<
  typeof GetElementWithChunkIdsQuerySchema
>;

export type ElementWithChunkIds = {
  value: string;
  languageId: string;
  projectId: string;
  documentId: string;
  chunkIds: number[];
};

export const getElementWithChunkIds: Query<
  GetElementWithChunkIdsQuery,
  ElementWithChunkIds | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        value: vectorizedString.value,
        languageId: vectorizedString.languageId,
        projectId: document.projectId,
        documentId: document.id,
        chunkIds: sql<
          number[]
        >`coalesce(array_agg("Chunk"."id") filter (where "Chunk"."id" is not null), ARRAY[]::int[])`,
      })
      .from(translatableElement)
      .innerJoin(
        vectorizedString,
        eq(translatableElement.vectorizedStringId, vectorizedString.id),
      )
      .innerJoin(document, eq(translatableElement.documentId, document.id))
      .leftJoin(chunkSet, eq(vectorizedString.chunkSetId, chunkSet.id))
      .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
      .where(eq(translatableElement.id, query.elementId))
      .groupBy(
        translatableElement.id,
        vectorizedString.value,
        vectorizedString.languageId,
        document.projectId,
        document.id,
      )
      .limit(1),
  );
};
