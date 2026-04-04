import { notification } from "@cat/db";
import { and, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const MarkAllNotificationsReadCommandSchema = z.object({
  userId: z.uuidv4(),
});
export type MarkAllNotificationsReadCommand = z.infer<
  typeof MarkAllNotificationsReadCommandSchema
>;

/** @zh 全部标记已读。 @en Mark all notifications as read. */
export const markAllNotificationsRead: Command<
  MarkAllNotificationsReadCommand
> = async (ctx, cmd) => {
  await ctx.db
    .update(notification)
    .set({ status: "READ", updatedAt: new Date() })
    .where(
      and(
        eq(notification.recipientId, cmd.userId),
        eq(notification.status, "UNREAD"),
      ),
    );
  return { result: undefined, events: [] };
};
