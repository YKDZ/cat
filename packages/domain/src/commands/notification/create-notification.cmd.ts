import { notification } from "@cat/db";
import type { MessageCategory } from "@cat/shared";
import type { JSONType } from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import { domainEvent } from "#/events/domain-events.ts";
import type { Command } from "#/types.ts";

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
 * Create an in-app notification record and publish notification:created event.
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
        ...(inserted.data === null ? {} : { data: inserted.data }),
      }),
    ],
  };
};
