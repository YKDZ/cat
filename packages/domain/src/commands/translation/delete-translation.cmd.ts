import { eq, translation } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const DeleteTranslationCommandSchema = z.object({
  translationId: z.int(),
});

export type DeleteTranslationCommand = z.infer<
  typeof DeleteTranslationCommandSchema
>;

export const deleteTranslation: Command<DeleteTranslationCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .delete(translation)
    .where(eq(translation.id, command.translationId));

  return {
    result: undefined,
    events: [
      domainEvent("translation:deleted", {
        translationIds: [command.translationId],
      }),
    ],
  };
};
