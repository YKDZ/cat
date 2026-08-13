import { termConcept, termConceptToSubject } from "@cat/db";
import {
  assertSingleNonNullish,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import type { Command } from "#/types.ts";

export const CreateGlossaryConceptCommandSchema = z.object({
  glossaryId: z.uuidv4(),
  definition: z.string().min(1),
  subjectIds: z.array(z.int()).optional(),
});

export type CreateGlossaryConceptCommand = z.infer<
  typeof CreateGlossaryConceptCommandSchema
>;

export const createGlossaryConcept: Command<
  CreateGlossaryConceptCommand,
  { id: number; derivations: RecallDerivationReference[] }
> = async (ctx, command) => {
  return await inDatabaseTransaction(ctx.db, async (tx) => {
    const inserted = assertSingleNonNullish(
      await tx
        .insert(termConcept)
        .values({
          definition: command.definition,
          glossaryId: command.glossaryId,
        })
        .returning({ id: termConcept.id }),
    );

    if ((command.subjectIds?.length ?? 0) > 0) {
      await tx.insert(termConceptToSubject).values(
        command.subjectIds!.map((subjectId, idx) => ({
          termConceptId: inserted.id,
          subjectId,
          isPrimary: idx === 0,
        })),
      );
    }
    const derivations = await registerTermConceptRecallDerivationDemands(tx, [
      inserted.id,
    ]);

    return {
      result: { ...inserted, derivations },
      events: [domainEvent("concept:updated", { conceptId: inserted.id })],
    };
  });
};
