import type { MessageCategory } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

import { notification } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateNotificationCommandSchema = z.object({
  recipientId: z.uuidv4(),
  category: z.custom<MessageCategory>(),
  title: z.string(),
  body: z.string(),
  data: z.custom<JSONType | null | undefined>().optional(),
});
export type CreateNotificationCommand = z.infer<
  typeof CreateNotificationCommandSchema
>;

/**
 * @zh 创建站内通知记录并发布 notification:created 域事件。
 * @en Create an in-app notification record and publish notification:created event.
 */
export const createNotification: Command<
  CreateNotificationCommand,
  typeof notification.$inferSelect
> = async (ctx, cmd) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(notification)
      .values({
        recipientId: cmd.recipientId,
        category: cmd.category,
        title: cmd.title,
        body: cmd.body,
        data: cmd.data ?? null,
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [
      domainEvent("notification:created", {
        notificationId: inserted.id,
        recipientId: inserted.recipientId,
        category: inserted.category,
        title: inserted.title,
        body: inserted.body,
        data: inserted.data ?? undefined,
      }),
    ],
  };
};
