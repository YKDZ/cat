import { and, eq, or, recallDerivationState } from "@cat/db";
import { RecallDerivationReferenceSchema } from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetRecallDerivationStatesQuerySchema = z.strictObject({
  references: z.array(RecallDerivationReferenceSchema),
});

export type RecallDerivationStateView =
  typeof recallDerivationState.$inferSelect;

export const getRecallDerivationStates: Query<
  z.infer<typeof GetRecallDerivationStatesQuerySchema>,
  RecallDerivationStateView[]
> = async (ctx, input) => {
  if (input.references.length === 0) return [];
  return await ctx.db
    .select()
    .from(recallDerivationState)
    .where(
      or(
        ...input.references.map((reference) =>
          and(
            eq(recallDerivationState.targetKind, reference.targetKind),
            eq(recallDerivationState.targetId, reference.targetId),
            eq(recallDerivationState.languageId, reference.languageId),
          ),
        ),
      ),
    );
};
