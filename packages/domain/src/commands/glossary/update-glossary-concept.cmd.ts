import { eq, termConcept, termConceptToSubject } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdateGlossaryConceptCommandSchema = z.object({
  conceptId: z.int(),
  subjectIds: z.array(z.int()).optional(),
  definition: z.string().optional(),
});

export type UpdateGlossaryConceptCommand = z.infer<
  typeof UpdateGlossaryConceptCommandSchema
>;

export type UpdateGlossaryConceptResult = {
  updated: boolean;
  glossaryId: string;
};

export const updateGlossaryConcept: Command<
  UpdateGlossaryConceptCommand,
  UpdateGlossaryConceptResult
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

  let changed = false;

  if (command.subjectIds !== undefined) {
    await ctx.db
      .delete(termConceptToSubject)
      .where(eq(termConceptToSubject.termConceptId, command.conceptId));

    if (command.subjectIds.length > 0) {
      await ctx.db.insert(termConceptToSubject).values(
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
    await ctx.db
      .update(termConcept)
      .set({ definition: command.definition || "" })
      .where(eq(termConcept.id, command.conceptId));

    changed = true;
  }

  return {
    result: {
      updated: changed,
      glossaryId: concept.glossaryId,
    },
    events: changed
      ? [domainEvent("concept:updated", { conceptId: command.conceptId })]
      : [],
  };
};
