import { asc, user } from "@cat/db";

import type { Query } from "@/types";

export const getFirstRegisteredUser: Query<
  Record<string, never>,
  { id: string } | null
> = async (ctx) => {
  const rows = await ctx.db
    .select({ id: user.id })
    .from(user)
    .orderBy(asc(user.createdAt))
    .limit(1);
  return rows[0] ?? null;
};
