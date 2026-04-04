import { userMessagePreference } from "@cat/db";
import { eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListPreferencesQuerySchema = z.object({ userId: z.uuidv4() });
export type ListPreferencesQuery = z.infer<typeof ListPreferencesQuerySchema>;

/** @zh 查询用户全部消息偏好。 @en List all message preferences for a user. */
export const listPreferences: Query<
  ListPreferencesQuery,
  (typeof userMessagePreference.$inferSelect)[]
> = async (ctx, query) => {
  return ctx.db
    .select()
    .from(userMessagePreference)
    .where(eq(userMessagePreference.userId, query.userId));
};
