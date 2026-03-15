import { count, eq, termConcept } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const CountGlossaryConceptsQuerySchema = z.object({
  glossaryId: z.uuidv4(),
});

export type CountGlossaryConceptsQuery = z.infer<
  typeof CountGlossaryConceptsQuerySchema
>;

export const countGlossaryConcepts: Query<
  CountGlossaryConceptsQuery,
  number
> = async (ctx, query) => {
  return assertSingleNonNullish(
    await ctx.db
      .select({ count: count() })
      .from(termConcept)
      .where(eq(termConcept.glossaryId, query.glossaryId)),
  ).count;
};
