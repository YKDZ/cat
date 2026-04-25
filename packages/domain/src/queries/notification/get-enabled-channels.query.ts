import type { MessageCategory, MessageChannel } from "@cat/shared";

import { userMessagePreference } from "@cat/db";
import { and, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetEnabledChannelsQuerySchema = z.object({
  userId: z.uuidv4(),
  category: z.custom<MessageCategory>(),
});
export type GetEnabledChannelsQuery = z.infer<
  typeof GetEnabledChannelsQuerySchema
>;

/**
 * @zh 获取用户对指定类别的启用渠道列表。未配置时默认 `["IN_APP"]`。
 * @en Get enabled channels for a user's message category. Falls back to `["IN_APP"]`.
 */
export const getEnabledChannels: Query<
  GetEnabledChannelsQuery,
  MessageChannel[]
> = async (ctx, query) => {
  const prefs = await ctx.db
    .select()
    .from(userMessagePreference)
    .where(
      and(
        eq(userMessagePreference.userId, query.userId),
        eq(userMessagePreference.category, query.category),
        eq(userMessagePreference.enabled, true),
      ),
    );
  return prefs.length === 0 ? ["IN_APP"] : prefs.map((p) => p.channel);
};
