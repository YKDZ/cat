import { translationVote } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpsertTranslationVoteCommandSchema = z.object({
  translationId: z.int(),
  voterId: z.uuidv4(),
  value: z.int(),
});

export type UpsertTranslationVoteCommand = z.infer<
  typeof UpsertTranslationVoteCommandSchema
>;

export const upsertTranslationVote: Command<
  UpsertTranslationVoteCommand,
  typeof translationVote.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(translationVote)
      .values({
        translationId: command.translationId,
        voterId: command.voterId,
        value: command.value,
      })
      .onConflictDoUpdate({
        target: [translationVote.translationId, translationVote.voterId],
        set: { value: command.value },
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [
      domainEvent("translation:updated", {
        translationIds: [command.translationId],
      }),
    ],
  };
};
