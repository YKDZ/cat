import { eq, term, termConcept } from "@cat/db";
import {
  TermStatusValues,
  TermTypeValues,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const UpdateGlossaryTermCommandSchema = z.strictObject({
  termId: z.int().positive(),
  text: z.string().min(1).optional(),
  languageId: z.string().min(1).optional(),
  type: z.enum(TermTypeValues).optional(),
  status: z.enum(TermStatusValues).optional(),
});

export type UpdateGlossaryTermResult = {
  updated: boolean;
  termId: number;
  conceptId: number;
  glossaryId: string;
  derivations: RecallDerivationReference[];
};

export const updateGlossaryTerm: Command<
  z.infer<typeof UpdateGlossaryTermCommandSchema>,
  UpdateGlossaryTermResult
> = async (ctx, input) => {
  const command = UpdateGlossaryTermCommandSchema.parse(input);
  const result = await inDatabaseTransaction(ctx.db, async (tx) => {
    const [target] = await tx
      .select({ conceptId: term.termConceptId })
      .from(term)
      .where(eq(term.id, command.termId))
      .limit(1);
    if (!target) throw new TypeError(`Term ${command.termId} does not exist.`);
    await lockTermConceptRecallScopes(tx, [target.conceptId]);
    const [existing] = await tx
      .select({
        termId: term.id,
        conceptId: term.termConceptId,
        glossaryId: termConcept.glossaryId,
      })
      .from(term)
      .innerJoin(termConcept, eq(termConcept.id, term.termConceptId))
      .where(eq(term.id, command.termId))
      .limit(1)
      .for("update");
    if (!existing)
      throw new TypeError(`Term ${command.termId} does not exist.`);
    const update = {
      ...(command.text === undefined ? {} : { text: command.text }),
      ...(command.languageId === undefined
        ? {}
        : { languageId: command.languageId }),
      ...(command.type === undefined ? {} : { type: command.type }),
      ...(command.status === undefined ? {} : { status: command.status }),
    };
    const updated = Object.keys(update).length > 0;
    if (updated) {
      await tx
        .update(term)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(term.id, command.termId));
    }
    const derivations = updated
      ? await registerTermConceptRecallDerivationDemands(tx, [
          existing.conceptId,
        ])
      : [];
    return { ...existing, updated, derivations };
  });
  return {
    result,
    events: result.updated
      ? [
          domainEvent("term:updated", {
            glossaryId: result.glossaryId,
            termIds: [result.termId],
          }),
          domainEvent("concept:updated", { conceptId: result.conceptId }),
        ]
      : [],
  };
};
