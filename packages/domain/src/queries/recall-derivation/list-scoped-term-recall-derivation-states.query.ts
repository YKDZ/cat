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
import * as z from "zod";

import type { ScopedRecallDerivationStateView } from "#/queries/recall-derivation/list-scoped-memory-recall-derivation-states.query.ts";
import type { Query } from "#/types.ts";

export const ListScopedTermRecallDerivationStatesQuerySchema = z.strictObject({
  glossaryIds: z.array(z.uuidv4()),
  sourceLanguageId: z.string().min(1),
  translationLanguageId: z.string().min(1),
});

export const listScopedTermRecallDerivationStates: Query<
  z.infer<typeof ListScopedTermRecallDerivationStatesQuerySchema>,
  ScopedRecallDerivationStateView[]
> = async (ctx, input) => {
  if (input.glossaryIds.length === 0) return [];
  const sourceTerm = aliasedTable(term, "scopedSourceTerm");
  const translationTerm = aliasedTable(term, "scopedTranslationTerm");
  return await ctx.db
    .selectDistinct({
      targetId: sql<string>`${termConcept.id}::text`,
      stateId: recallDerivationState.id,
      languageId: sql<string>`${input.sourceLanguageId}`,
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
        eq(sourceTerm.languageId, input.sourceLanguageId),
      ),
    )
    .innerJoin(
      translationTerm,
      and(
        eq(translationTerm.termConceptId, termConcept.id),
        eq(translationTerm.languageId, input.translationLanguageId),
      ),
    )
    .leftJoin(
      recallDerivationState,
      and(
        eq(recallDerivationState.targetKind, "TERM_CONCEPT"),
        sql`${recallDerivationState.targetId} = ${termConcept.id}::text`,
        eq(recallDerivationState.languageId, input.sourceLanguageId),
      ),
    )
    .where(inArray(termConcept.glossaryId, input.glossaryIds))
    .orderBy(sql`${termConcept.id}::text`);
};
