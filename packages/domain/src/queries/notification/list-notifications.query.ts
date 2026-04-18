import { notification } from "@cat/db";
import { and, desc, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListNotificationsQuerySchema = z.object({
  userId: z.uuidv4(),
  pageIndex: z.int().nonnegative(),
  pageSize: z.int().positive().max(100),
  statusFilter: z.enum(["UNREAD", "READ", "ARCHIVED"]).optional(),
});
export type ListNotificationsQuery = z.infer<
  typeof ListNotificationsQuerySchema
>;

/** @zh 分页查询通知列表。 @en Query paginated notifications. */
export const listNotifications: Query<
  ListNotificationsQuery,
  (typeof notification.$inferSelect)[]
> = async (ctx, query) => {
  const conditions = [eq(notification.recipientId, query.userId)];
  if (query.statusFilter)
    conditions.push(eq(notification.status, query.statusFilter));
  return ctx.db
    .select()
    .from(notification)
    .where(and(...conditions))
    .orderBy(desc(notification.createdAt))
    .limit(query.pageSize)
    .offset(query.pageIndex * query.pageSize);
};
