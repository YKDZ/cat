import { eq, termConcept } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const SetConceptStringIdCommandSchema = z.object({
  conceptId: z.int(),
  stringId: z.int().nullable(),
});

export type SetConceptStringIdCommand = z.infer<
  typeof SetConceptStringIdCommandSchema
>;

export type SetConceptStringIdResult = {
  updated: boolean;
};

export const setConceptStringId: Command<
  SetConceptStringIdCommand,
  SetConceptStringIdResult
> = async (ctx, command) => {
  const updatedRows = await ctx.db
    .update(termConcept)
    .set({ stringId: command.stringId })
    .where(eq(termConcept.id, command.conceptId))
    .returning({ id: termConcept.id });

  const updated = updatedRows.length > 0;

  return {
    result: { updated },
    events: updated
      ? [domainEvent("concept:updated", { conceptId: command.conceptId })]
      : [],
  };
};
