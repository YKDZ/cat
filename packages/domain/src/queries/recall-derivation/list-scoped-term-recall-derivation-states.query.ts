import {
  aliasedTable,
  and,
  eq,
  inArray,
  recallDerivationState,
  sql,
  term,
  termConcept,
} from "@cat/db";
import {
  NormalizedLanguageIdSchema,
  type NormalizedLanguageId,
} from "@cat/shared";
import * as z from "zod";

import type { ScopedRecallDerivationStateView } from "#/queries/recall-derivation/list-scoped-memory-recall-derivation-states.query.ts";
import type { Query } from "#/types.ts";

export const ListScopedTermRecallDerivationStatesQuerySchema = z.strictObject({
  glossaryIds: z.array(z.uuidv4()),
  sourceLanguageId: NormalizedLanguageIdSchema,
  translationLanguageId: NormalizedLanguageIdSchema,
});

export type ListScopedTermRecallDerivationStatesQuery = z.input<
  typeof ListScopedTermRecallDerivationStatesQuerySchema
>;

export const listScopedTermRecallDerivationStates: Query<
  ListScopedTermRecallDerivationStatesQuery,
  ScopedRecallDerivationStateView[]
> = async (ctx, input) => {
  const query = ListScopedTermRecallDerivationStatesQuerySchema.parse(input);
  if (query.glossaryIds.length === 0) return [];
  const sourceTerm = aliasedTable(term, "scopedSourceTerm");
  const translationTerm = aliasedTable(term, "scopedTranslationTerm");
  return await ctx.db
    .selectDistinct({
      targetId: sql<string>`${termConcept.id}::text`,
      stateId: recallDerivationState.id,
      languageId: sql<NormalizedLanguageId>`${query.sourceLanguageId}`,
      status: recallDerivationState.status,
      demandRevision: recallDerivationState.demandRevision,
      blocker: recallDerivationState.blocker,
      canonicalInputVersion: recallDerivationState.canonicalInputVersion,
      requiredDerivationVersion:
        recallDerivationState.requiredDerivationVersion,
      currentCanonicalInputVersion:
        recallDerivationState.currentCanonicalInputVersion,
      currentDerivationVersion: recallDerivationState.currentDerivationVersion,
    })
    .from(termConcept)
    .innerJoin(
      sourceTerm,
      and(
        eq(sourceTerm.termConceptId, termConcept.id),
        eq(sourceTerm.languageId, query.sourceLanguageId),
      ),
    )
    .innerJoin(
      translationTerm,
      and(
        eq(translationTerm.termConceptId, termConcept.id),
        eq(translationTerm.languageId, query.translationLanguageId),
      ),
    )
    .leftJoin(
      recallDerivationState,
      and(
        eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
        sql`${recallDerivationState.targetId} = ${termConcept.id}::text`,
        eq(recallDerivationState.languageId, query.sourceLanguageId),
      ),
    )
    .where(inArray(termConcept.glossaryId, query.glossaryIds))
    .orderBy(sql`${termConcept.id}::text`);
};
