import { and, eq, translatableElement, translation } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UnapproveTranslationCommandSchema = z.object({
  translationId: z.int(),
});

export type UnapproveTranslationCommand = z.infer<
  typeof UnapproveTranslationCommandSchema
>;

export const unapproveTranslation: Command<
  UnapproveTranslationCommand
> = async (ctx, command) => {
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
      approvedTranslationId: null,
    })
    .where(
      and(
        eq(translatableElement.id, row.translatableElementId),
        eq(translatableElement.approvedTranslationId, command.translationId),
      ),
    );

  return {
    result: undefined,
    events: [
      domainEvent("translation:updated", {
        translationIds: [command.translationId],
      }),
    ],
  };
};
