import { loginAttempt as loginAttemptTable } from "@cat/db";
import { and, eq, gte, sql } from "@cat/db";

import type { Query } from "@/types";

export interface CountRecentAttemptsQuery {
  identifier?: string;
  ip?: string;
  windowMinutes: number;
}

export const countRecentAttempts: Query<
  CountRecentAttemptsQuery,
  number
> = async (ctx, query) => {
  const since = new Date(Date.now() - query.windowMinutes * 60 * 1000);

  const conditions = [
    eq(loginAttemptTable.success, false),
    gte(loginAttemptTable.createdAt, since),
  ];

  if (query.identifier) {
    conditions.push(eq(loginAttemptTable.identifier, query.identifier));
  }
  if (query.ip) {
    conditions.push(eq(loginAttemptTable.ip, query.ip));
  }

  const [row] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(loginAttemptTable)
    .where(and(...conditions));

  return Number(row?.count ?? 0);
};
