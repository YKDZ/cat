import {
  chunk,
  chunkSet,
  document,
  eq,
  sql,
  translatableElement,
  translatableString,
} from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

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
        value: translatableString.value,
        languageId: translatableString.languageId,
        projectId: document.projectId,
        documentId: document.id,
        chunkIds: sql<
          number[]
        >`coalesce(array_agg("Chunk"."id") filter (where "Chunk"."id" is not null), ARRAY[]::int[])`,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .innerJoin(document, eq(translatableElement.documentId, document.id))
      .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
      .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
      .where(eq(translatableElement.id, query.elementId))
      .groupBy(
        translatableElement.id,
        translatableString.value,
        translatableString.languageId,
        document.projectId,
        document.id,
      )
      .limit(1),
  );
};
