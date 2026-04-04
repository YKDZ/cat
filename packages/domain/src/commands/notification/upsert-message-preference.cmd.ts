import type { MessageCategory, MessageChannel } from "@cat/shared/schema/enum";

import { userMessagePreference } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const UpsertMessagePreferenceCommandSchema = z.object({
  userId: z.uuidv4(),
  category: z.custom<MessageCategory>(),
  channel: z.custom<MessageChannel>(),
  enabled: z.boolean(),
});
export type UpsertMessagePreferenceCommand = z.infer<
  typeof UpsertMessagePreferenceCommandSchema
>;

/**
 * @zh 更新用户消息偏好（upsert）。 @en Update user message preference (upsert).
 */
export const upsertMessagePreference: Command<
  UpsertMessagePreferenceCommand
> = async (ctx, cmd) => {
  await ctx.db
    .insert(userMessagePreference)
    .values({
      userId: cmd.userId,
      category: cmd.category,
      channel: cmd.channel,
      enabled: cmd.enabled,
    })
    .onConflictDoUpdate({
      target: [
        userMessagePreference.userId,
        userMessagePreference.category,
        userMessagePreference.channel,
      ],
      set: { enabled: cmd.enabled },
    });
  return { result: undefined, events: [] };
};
