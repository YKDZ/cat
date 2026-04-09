import { eq, termConcept, vectorizedString } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetConceptVectorizationSnapshotQuerySchema = z.object({
  conceptId: z.int(),
});

export type GetConceptVectorizationSnapshotQuery = z.infer<
  typeof GetConceptVectorizationSnapshotQuerySchema
>;

export type ConceptVectorizationSnapshot = {
  stringId: number | null;
  text: string | null;
};

export const getConceptVectorizationSnapshot: Query<
  GetConceptVectorizationSnapshotQuery,
  ConceptVectorizationSnapshot | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({
        stringId: termConcept.stringId,
        text: vectorizedString.value,
      })
      .from(termConcept)
      .leftJoin(vectorizedString, eq(vectorizedString.id, termConcept.stringId))
      .where(eq(termConcept.id, query.conceptId))
      .limit(1),
  );

  if (!row) {
    return null;
  }

  return {
    stringId: row.stringId,
    text: row.text,
  };
};
