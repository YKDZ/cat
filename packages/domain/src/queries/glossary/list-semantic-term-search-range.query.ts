import {
  and,
  chunk,
  eq,
  inArray,
  isNotNull,
  termConcept,
  translatableString,
} from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListSemanticTermSearchRangeQuerySchema = z.object({
  glossaryIds: z.array(z.uuidv4()),
});

export type ListSemanticTermSearchRangeQuery = z.infer<
  typeof ListSemanticTermSearchRangeQuerySchema
>;

export type SemanticTermSearchRangeRow = {
  chunkId: number;
  conceptId: number;
};

export const listSemanticTermSearchRange: Query<
  ListSemanticTermSearchRangeQuery,
  SemanticTermSearchRangeRow[]
> = async (ctx, query) => {
  if (query.glossaryIds.length === 0) {
    return [];
  }

  return ctx.db
    .selectDistinct({
      chunkId: chunk.id,
      conceptId: termConcept.id,
    })
    .from(termConcept)
    .innerJoin(
      translatableString,
      eq(translatableString.id, termConcept.stringId),
    )
    .innerJoin(chunk, eq(chunk.chunkSetId, translatableString.chunkSetId))
    .where(
      and(
        inArray(termConcept.glossaryId, query.glossaryIds),
        isNotNull(termConcept.stringId),
      ),
    );
};
