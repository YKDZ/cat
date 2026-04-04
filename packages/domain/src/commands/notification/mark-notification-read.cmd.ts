import { notification } from "@cat/db";
import { and, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const MarkNotificationReadCommandSchema = z.object({
  notificationId: z.int(),
  userId: z.uuidv4(),
});
export type MarkNotificationReadCommand = z.infer<
  typeof MarkNotificationReadCommandSchema
>;

/** @zh 将通知标记为已读并发布 notification:status-changed 事件。 @en Mark notification read. */
export const markNotificationRead: Command<
  MarkNotificationReadCommand
> = async (ctx, cmd) => {
  await ctx.db
    .update(notification)
    .set({ status: "READ", updatedAt: new Date() })
    .where(
      and(
        eq(notification.id, cmd.notificationId),
        eq(notification.recipientId, cmd.userId),
      ),
    );

  return {
    result: undefined,
    events: [
      domainEvent("notification:status-changed", {
        notificationId: cmd.notificationId,
        recipientId: cmd.userId,
        status: "READ",
      }),
    ],
  };
};
