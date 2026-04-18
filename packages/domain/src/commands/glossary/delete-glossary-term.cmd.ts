import { eq, term, termConcept } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const DeleteGlossaryTermCommandSchema = z.object({
  termId: z.int(),
});

export type DeleteGlossaryTermCommand = z.infer<
  typeof DeleteGlossaryTermCommandSchema
>;

export type DeleteGlossaryTermResult = {
  deleted: boolean;
  conceptId: number | null;
  glossaryId: string | null;
};

export const deleteGlossaryTerm: Command<
  DeleteGlossaryTermCommand,
  DeleteGlossaryTermResult
> = async (ctx, command) => {
  const existingRows = await ctx.db
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
      },
      events: [],
    };
  }

  await ctx.db.delete(term).where(eq(term.id, command.termId));

  return {
    result: {
      deleted: true,
      conceptId: existing.conceptId,
      glossaryId: existing.glossaryId,
    },
    events: [
      domainEvent("term:deleted", {
        glossaryId: existing.glossaryId,
        termIds: [command.termId],
      }),
      domainEvent("concept:updated", { conceptId: existing.conceptId }),
    ],
  };
};
