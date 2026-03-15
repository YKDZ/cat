import {
  chunk,
  chunkSet,
  document,
  eq,
  sql,
  translatableElement,
  translatableString,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListDocumentElementsWithChunkIdsQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type ListDocumentElementsWithChunkIdsQuery = z.infer<
  typeof ListDocumentElementsWithChunkIdsQuerySchema
>;

export type DocumentElementWithChunkIds = {
  id: number;
  value: string;
  languageId: string;
  chunkIds: number[];
};

export const listDocumentElementsWithChunkIds: Query<
  ListDocumentElementsWithChunkIdsQuery,
  DocumentElementWithChunkIds[]
> = async (ctx, query) => {
  return ctx.db
    .select({
      id: translatableElement.id,
      value: translatableString.value,
      languageId: translatableString.languageId,
      chunkIds: sql<
        number[]
      >`coalesce(array_agg("Chunk"."id") filter (where "Chunk"."id" is not null), ARRAY[]::int[])`,
    })
    .from(translatableElement)
    .innerJoin(document, eq(document.id, translatableElement.documentId))
    .innerJoin(
      translatableString,
      eq(translatableElement.translatableStringId, translatableString.id),
    )
    .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
    .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
    .where(eq(translatableElement.documentId, query.documentId))
    .groupBy(
      translatableElement.id,
      translatableString.value,
      translatableString.languageId,
    );
};
