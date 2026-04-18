import { eq, translatableElement, translation } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const ApproveTranslationCommandSchema = z.object({
  translationId: z.int(),
});

export type ApproveTranslationCommand = z.infer<
  typeof ApproveTranslationCommandSchema
>;

export const approveTranslation: Command<ApproveTranslationCommand> = async (
  ctx,
  command,
) => {
  const row = assertSingleNonNullish(
    await ctx.db
      .select({
        translatableElementId: translation.translatableElementId,
      })
      .from(translation)
      .where(eq(translation.id, command.translationId)),
  );

  await ctx.db
    .update(translatableElement)
    .set({
      approvedTranslationId: command.translationId,
    })
    .where(eq(translatableElement.id, row.translatableElementId));

  return {
    result: undefined,
    events: [
      domainEvent("translation:updated", {
        translationIds: [command.translationId],
      }),
    ],
  };
};
