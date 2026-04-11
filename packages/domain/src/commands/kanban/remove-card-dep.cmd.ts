import { and, eq, kanbanCardDep } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const RemoveCardDepCommandSchema = z.object({
  /** @zh 依赖方卡片的数据库 ID @en Database ID of the dependent card */
  cardId: z.int().positive(),
  /** @zh 被依赖卡片的数据库 ID @en Database ID of the card being depended on */
  dependsOnCardId: z.int().positive(),
});

export type RemoveCardDepCommand = z.infer<typeof RemoveCardDepCommandSchema>;

/**
 * @zh 移除两张看板卡片之间的依赖关系。
 * @en Remove a dependency between two kanban cards.
 */
export const removeCardDep: Command<RemoveCardDepCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .delete(kanbanCardDep)
    .where(
      and(
        eq(kanbanCardDep.cardId, command.cardId),
        eq(kanbanCardDep.dependsOnCardId, command.dependsOnCardId),
      ),
    );

  return { result: undefined, events: [] };
};
