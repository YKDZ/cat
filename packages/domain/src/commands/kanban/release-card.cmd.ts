import { eq, kanbanCard } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const ReleaseCardCommandSchema = z.object({
  cardId: z.int().positive(),
});

export type ReleaseCardCommand = z.infer<typeof ReleaseCardCommandSchema>;

/**
 * @zh 释放已领取的卡片，将其状态重置为 OPEN（用于超时或手动取消）。
 * @en Release a claimed card, resetting its status to OPEN (for timeout or manual cancel).
 */
export const releaseCard: Command<ReleaseCardCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(kanbanCard)
    .set({
      status: "OPEN",
      claimedAt: null,
      claimedBy: null,
      assigneeAgentId: null,
      assigneeUserId: null,
      updatedAt: new Date(),
    })
    .where(eq(kanbanCard.id, command.cardId));
  return { result: undefined, events: [] };
};
