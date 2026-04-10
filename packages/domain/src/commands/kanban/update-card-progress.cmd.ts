import { eq, kanbanCard } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpdateCardProgressCommandSchema = z.object({
  cardId: z.int().positive(),
  columnId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateCardProgressCommand = z.infer<
  typeof UpdateCardProgressCommandSchema
>;

export const updateCardProgress: Command<UpdateCardProgressCommand> = async (
  ctx,
  command,
) => {
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (command.columnId !== undefined) update.columnId = command.columnId;
  if (command.metadata !== undefined) update.metadata = command.metadata;

  await ctx.db
    .update(kanbanCard)
    .set(update)
    .where(eq(kanbanCard.id, command.cardId));
  return { result: undefined, events: [] };
};
