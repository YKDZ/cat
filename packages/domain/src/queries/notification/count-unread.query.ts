import { notification } from "@cat/db";
import { and, count, eq } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const CountUnreadQuerySchema = z.object({ userId: z.uuidv4() });
export type CountUnreadQuery = z.infer<typeof CountUnreadQuerySchema>;

/** @zh 查询未读通知数量。 @en Count unread notifications. */
export const countUnread: Query<CountUnreadQuery, number> = async (
  ctx,
  query,
) => {
  const result = await ctx.db
    .select({ count: count() })
    .from(notification)
    .where(
      and(
        eq(notification.recipientId, query.userId),
        eq(notification.status, "UNREAD"),
      ),
    );
  return result[0]?.count ?? 0;
};
