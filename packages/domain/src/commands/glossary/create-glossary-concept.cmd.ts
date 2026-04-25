import { termConcept, termConceptToSubject } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

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
  { id: number }
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(termConcept)
      .values({
        definition: command.definition,
        glossaryId: command.glossaryId,
      })
      .returning({ id: termConcept.id }),
  );

  if ((command.subjectIds?.length ?? 0) > 0) {
    await ctx.db.insert(termConceptToSubject).values(
      command.subjectIds!.map((subjectId, idx) => ({
        termConceptId: inserted.id,
        subjectId,
        isPrimary: idx === 0,
      })),
    );
  }

  return {
    result: inserted,
    events: [domainEvent("concept:updated", { conceptId: inserted.id })],
  };
};
