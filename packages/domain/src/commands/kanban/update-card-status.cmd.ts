import { eq, getColumns, kanbanCard } from "@cat/db";
import { KanbanCardStatusSchema } from "@cat/shared/schema/enum";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpdateCardStatusCommandSchema = z.object({
  cardId: z.int().positive(),
  status: KanbanCardStatusSchema,
});

export type UpdateCardStatusCommand = z.infer<
  typeof UpdateCardStatusCommandSchema
>;

export const updateCardStatus: Command<
  UpdateCardStatusCommand,
  typeof kanbanCard.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(kanbanCard)
      .set({ status: command.status, updatedAt: new Date() })
      .where(eq(kanbanCard.id, command.cardId))
      .returning({ ...getColumns(kanbanCard) }),
  );
  return { result: updated, events: [] };
};
