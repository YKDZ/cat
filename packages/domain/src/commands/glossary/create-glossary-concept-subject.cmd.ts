import { termConceptSubject } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateGlossaryConceptSubjectCommandSchema = z.object({
  glossaryId: z.uuidv4(),
  subject: z.string().min(1),
  defaultDefinition: z.string().optional(),
});

export type CreateGlossaryConceptSubjectCommand = z.infer<
  typeof CreateGlossaryConceptSubjectCommandSchema
>;

export const createGlossaryConceptSubject: Command<
  CreateGlossaryConceptSubjectCommand,
  { id: number }
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(termConceptSubject)
      .values({
        glossaryId: command.glossaryId,
        subject: command.subject,
        defaultDefinition: command.defaultDefinition ?? null,
      })
      .returning({ id: termConceptSubject.id }),
  );

  return {
    result: inserted,
    events: [],
  };
};
