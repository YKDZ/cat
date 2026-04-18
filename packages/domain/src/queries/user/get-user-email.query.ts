import { user } from "@cat/db";
import { eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetUserEmailQuerySchema = z.object({ userId: z.uuidv4() });
export type GetUserEmailQuery = z.infer<typeof GetUserEmailQuerySchema>;

/** @zh 按用户 ID 查询邮件地址。 @en Get a user's email address by user ID. */
export const getUserEmail: Query<GetUserEmailQuery, string | null> = async (
  ctx,
  query,
) => {
  const result = await ctx.db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, query.userId))
    .limit(1);
  return result[0]?.email ?? null;
};
