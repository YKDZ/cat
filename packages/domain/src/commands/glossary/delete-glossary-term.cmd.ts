import { and, eq, glossaryToProject, term, termConcept } from "@cat/db";
import type { RecallDerivationReference } from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import type { Command } from "#/types.ts";

export const DeleteGlossaryTermCommandSchema = z.object({
  termId: z.int(),
  projectId: z.uuidv4().optional(),
});

export type DeleteGlossaryTermCommand = z.infer<
  typeof DeleteGlossaryTermCommandSchema
>;

export type DeleteGlossaryTermResult = {
  deleted: boolean;
  conceptId: number | null;
  glossaryId: string | null;
  derivations: RecallDerivationReference[];
  before: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>> | null;
  after: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>> | null;
};

export const deleteGlossaryTerm: Command<
  DeleteGlossaryTermCommand,
  DeleteGlossaryTermResult
> = async (ctx, command) => {
  return await inDatabaseTransaction(ctx.db, async (tx) => {
    const [target] = await tx
      .select({ conceptId: term.termConceptId })
      .from(term)
      .where(eq(term.id, command.termId))
      .limit(1);
    if (!target) {
      return {
        result: {
          deleted: false,
          conceptId: null,
          glossaryId: null,
          derivations: [],
          before: null,
          after: null,
        },
        events: [],
      };
    }
    await lockTermConceptRecallScopes(tx, [target.conceptId]);
    const before = await getGlossaryConceptMaterialization(
      { db: tx },
      { conceptId: target.conceptId },
    );
    const existingRows = await tx
      .select({
        id: term.id,
        conceptId: term.termConceptId,
        glossaryId: termConcept.glossaryId,
      })
      .from(term)
      .innerJoin(termConcept, eq(term.termConceptId, termConcept.id))
      .where(eq(term.id, command.termId))
      .limit(1);

    const existing = existingRows[0] ?? null;

    if (existing === null) {
      return {
        result: {
          deleted: false,
          conceptId: null,
          glossaryId: null,
          derivations: [],
          before: null,
          after: null,
        },
        events: [],
      };
    }
    if (command.projectId !== undefined) {
      const [link] = await tx
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(
          and(
            eq(glossaryToProject.glossaryId, existing.glossaryId),
            eq(glossaryToProject.projectId, command.projectId),
          ),
        )
        .limit(1)
        .for("key share");
      if (!link)
        throw new TypeError("Glossary is not linked to the requested project.");
    }

    await tx.delete(term).where(eq(term.id, command.termId));
    const derivations = await registerTermConceptRecallDerivationDemands(tx, [
      existing.conceptId,
    ]);

    return {
      result: {
        deleted: true,
        conceptId: existing.conceptId,
        glossaryId: existing.glossaryId,
        derivations,
        before,
        after: await getGlossaryConceptMaterialization(
          { db: tx },
          { conceptId: existing.conceptId },
        ),
      },
      events: [
        domainEvent("term:deleted", {
          glossaryId: existing.glossaryId,
          termIds: [command.termId],
        }),
        domainEvent("concept:updated", { conceptId: existing.conceptId }),
      ],
    };
  });
};
