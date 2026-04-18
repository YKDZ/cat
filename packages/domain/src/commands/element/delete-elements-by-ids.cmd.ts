import { inArray, translatableElement } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const DeleteElementsByIdsCommandSchema = z.object({
  elementIds: z.array(z.int()),
});

export type DeleteElementsByIdsCommand = z.infer<
  typeof DeleteElementsByIdsCommandSchema
>;

export const deleteElementsByIds: Command<DeleteElementsByIdsCommand> = async (
  ctx,
  command,
) => {
  if (command.elementIds.length === 0) {
    return {
      result: undefined,
      events: [],
    };
  }

  await ctx.db
    .delete(translatableElement)
    .where(inArray(translatableElement.id, command.elementIds));

  return {
    result: undefined,
    events: [],
  };
};
