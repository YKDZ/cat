import { translation } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateTranslationsCommandSchema = z.object({
  data: z.array(
    z.object({
      translatableElementId: z.int(),
      translatorId: z.uuidv4().nullable().optional(),
      stringId: z.int(),
      meta: z.json().optional(),
    }),
  ),
  documentId: z.uuidv4().optional(),
});

export type CreateTranslationsCommand = z.infer<
  typeof CreateTranslationsCommandSchema
>;

export const createTranslations: Command<
  CreateTranslationsCommand,
  number[]
> = async (ctx, command) => {
  if (command.data.length === 0) {
    return {
      result: [],
      events: [],
    };
  }

  const inserted = await ctx.db
    .insert(translation)
    .values(command.data)
    .returning({ id: translation.id });

  const translationIds = inserted.map((item) => item.id);
  const events =
    command.documentId === undefined
      ? []
      : [
          domainEvent("translation:created", {
            documentId: command.documentId,
            translationIds,
          }),
        ];

  return {
    result: translationIds,
    events,
  };
};
