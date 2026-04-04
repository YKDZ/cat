import { notification } from "@cat/db";
import { and, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetNotificationQuerySchema = z.object({
  notificationId: z.int(),
  userId: z.uuidv4(),
});
export type GetNotificationQuery = z.infer<typeof GetNotificationQuerySchema>;

/**
 * @zh 按 ID 查询单条通知（只允许查询自己的通知）。
 * @en Get a single notification by ID (restricted to the owner).
 */
export const getNotification: Query<
  GetNotificationQuery,
  typeof notification.$inferSelect | null
> = async (ctx, query) => {
  const result = await ctx.db
    .select()
    .from(notification)
    .where(
      and(
        eq(notification.id, query.notificationId),
        eq(notification.recipientId, query.userId),
      ),
    )
    .limit(1);
  return result[0] ?? null;
};
