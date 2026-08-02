import { and, eq, glossaryToProject, term, termConcept } from "@cat/db";
import {
  TermStatusValues,
  TermTypeValues,
  type RecallDerivationReference,
} from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import { lockTermConceptRecallScopes } from "#/commands/recall-derivation/lock-term-concept-recall-scopes.ts";
import { registerTermConceptRecallDerivationDemands } from "#/commands/recall-derivation/register-term-concept-recall-derivation-demands.ts";
import { domainEvent } from "#/events/domain-events.ts";
import { inDatabaseTransaction } from "#/infrastructure/db-transaction.ts";
import { getGlossaryConceptMaterialization } from "#/queries/glossary/get-glossary-term-concept-snapshot.query.ts";
import type { Command } from "#/types.ts";

export const AddGlossaryTermToConceptCommandSchema = z.object({
  conceptId: z.int(),
  text: z.string().min(1),
  languageId: z.string().min(1),
  type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
  status: z.enum(TermStatusValues).optional().default("PREFERRED"),
  creatorId: z.uuidv4().optional(),
  projectId: z.uuidv4().optional(),
});

export type AddGlossaryTermToConceptCommand = z.infer<
  typeof AddGlossaryTermToConceptCommandSchema
>;

export type AddGlossaryTermToConceptResult = {
  termId: number;
  conceptId: number;
  glossaryId: string;
  derivations: RecallDerivationReference[];
  before: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>>;
  after: Awaited<ReturnType<typeof getGlossaryConceptMaterialization>>;
};

export const addGlossaryTermToConcept: Command<
  AddGlossaryTermToConceptCommand,
  AddGlossaryTermToConceptResult
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

    const inserted = assertSingleNonNullish(
      await tx
        .insert(term)
        .values({
          termConceptId: command.conceptId,
          text: command.text,
          languageId: command.languageId,
          type: command.type,
          status: command.status,
          creatorId: command.creatorId ?? null,
        })
        .returning({ id: term.id }),
    );
    const derivations = await registerTermConceptRecallDerivationDemands(tx, [
      concept.id,
    ]);

    return {
      result: {
        termId: inserted.id,
        conceptId: concept.id,
        glossaryId: concept.glossaryId,
        derivations,
        before,
        after: await getGlossaryConceptMaterialization(
          { db: tx },
          { conceptId: command.conceptId },
        ),
      },
      events: [
        domainEvent("term:updated", {
          glossaryId: concept.glossaryId,
          termIds: [inserted.id],
        }),
        domainEvent("concept:updated", { conceptId: concept.id }),
      ],
    };
  });
};
