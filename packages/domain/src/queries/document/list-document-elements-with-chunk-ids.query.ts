import {
  chunk,
  chunkSet,
  document,
  eq,
  sql,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

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
      value: vectorizedString.value,
      languageId: vectorizedString.languageId,
      chunkIds: sql<
        number[]
      >`coalesce(array_agg("Chunk"."id") filter (where "Chunk"."id" is not null), ARRAY[]::int[])`,
    })
    .from(translatableElement)
    .innerJoin(document, eq(document.id, translatableElement.documentId))
    .innerJoin(
      vectorizedString,
      eq(translatableElement.vectorizedStringId, vectorizedString.id),
    )
    .innerJoin(chunkSet, eq(vectorizedString.chunkSetId, chunkSet.id))
    .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
    .where(eq(translatableElement.documentId, query.documentId))
    .groupBy(
      translatableElement.id,
      vectorizedString.value,
      vectorizedString.languageId,
    );
};
