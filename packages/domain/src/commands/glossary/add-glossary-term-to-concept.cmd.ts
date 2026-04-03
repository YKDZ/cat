import { eq, term, termConcept } from "@cat/db";
import { TermStatusValues, TermTypeValues } from "@cat/shared/schema/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const AddGlossaryTermToConceptCommandSchema = z.object({
  conceptId: z.int(),
  text: z.string().min(1),
  languageId: z.string().min(1),
  type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
  status: z.enum(TermStatusValues).optional().default("PREFERRED"),
  creatorId: z.uuidv4().optional(),
});

export type AddGlossaryTermToConceptCommand = z.infer<
  typeof AddGlossaryTermToConceptCommandSchema
>;

export type AddGlossaryTermToConceptResult = {
  termId: number;
  conceptId: number;
  glossaryId: string;
};

export const addGlossaryTermToConcept: Command<
  AddGlossaryTermToConceptCommand,
  AddGlossaryTermToConceptResult
> = async (ctx, command) => {
  const concept = assertSingleNonNullish(
    await ctx.db
      .select({
        id: termConcept.id,
        glossaryId: termConcept.glossaryId,
      })
      .from(termConcept)
      .where(eq(termConcept.id, command.conceptId))
      .limit(1),
  );

  const inserted = assertSingleNonNullish(
    await ctx.db
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

  return {
    result: {
      termId: inserted.id,
      conceptId: concept.id,
      glossaryId: concept.glossaryId,
    },
    events: [
      domainEvent("term:updated", {
        glossaryId: concept.glossaryId,
        termIds: [inserted.id],
      }),
      domainEvent("concept:updated", { conceptId: concept.id }),
    ],
  };
};
