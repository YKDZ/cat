import {
  and,
  eq,
  glossaryToProject,
  termConcept,
  termConceptToSubject,
} from "@cat/db";
import {
  assertSingleNonNullish,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import type { Command } from "#/types.ts";

export const UpdateGlossaryConceptCommandSchema = z.object({
  conceptId: z.int(),
  subjectIds: z.array(z.int()).optional(),
  definition: z.string().optional(),
  projectId: z.uuidv4().optional(),
});

export type UpdateGlossaryConceptCommand = z.infer<
  typeof UpdateGlossaryConceptCommandSchema
>;

export type UpdateGlossaryConceptResult = {
  updated: boolean;
  glossaryId: string;
  derivations: RecallDerivationReference[];
  before: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>>;
  after: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>> | null;
};

export const updateGlossaryConcept: Command<
  UpdateGlossaryConceptCommand,
  UpdateGlossaryConceptResult
> = async (ctx, command) => {
  return await inDatabaseTransaction(ctx.db, async (tx) => {
    await lockTermConceptRecallScopes(tx, [command.conceptId]);
    const before = await getGlossaryConceptMaterialization(
      { db: tx },
      { conceptId: command.conceptId },
    );
    const concept = assertSingleNonNullish(
      await tx
        .select({
          id: termConcept.id,
          glossaryId: termConcept.glossaryId,
        })
        .from(termConcept)
        .where(eq(termConcept.id, command.conceptId))
        .limit(1),
    );
    if (command.projectId !== undefined) {
      const [link] = await tx
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(
          and(
            eq(glossaryToProject.glossaryId, concept.glossaryId),
            eq(glossaryToProject.projectId, command.projectId),
          ),
        )
        .limit(1)
        .for("key share");
      if (!link)
        throw new TypeError("Glossary is not linked to the requested project.");
    }

    let changed = false;

    if (command.subjectIds !== undefined) {
      await tx
        .delete(termConceptToSubject)
        .where(eq(termConceptToSubject.termConceptId, command.conceptId));

      if (command.subjectIds.length > 0) {
        await tx.insert(termConceptToSubject).values(
          command.subjectIds.map((subjectId, index) => ({
            termConceptId: command.conceptId,
            subjectId,
            isPrimary: index === 0,
          })),
        );
      }

      changed = true;
    }

    if (command.definition !== undefined) {
      await tx
        .update(termConcept)
        .set({ definition: command.definition || "" })
        .where(eq(termConcept.id, command.conceptId));

      changed = true;
    }
    const derivations = changed
      ? await registerTermConceptRecallDerivationDemands(tx, [
          command.conceptId,
        ])
      : [];

    return {
      result: {
        updated: changed,
        glossaryId: concept.glossaryId,
        derivations,
        before,
        after: changed
          ? await getGlossaryConceptMaterialization(
              { db: tx },
              { conceptId: command.conceptId },
            )
          : null,
      },
      events: changed
        ? [domainEvent("concept:updated", { conceptId: command.conceptId })]
        : [],
    };
  });
};
