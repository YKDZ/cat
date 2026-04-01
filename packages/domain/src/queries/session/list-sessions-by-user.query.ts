import { sessionRecord as sessionRecordTable } from "@cat/db";
import { and, eq, gt, isNull } from "@cat/db";

import type { Query } from "@/types";

export interface ListSessionsByUserQuery {
  userId: string;
}

export interface SessionRecordRow {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  authProviderId: number | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const listSessionsByUser: Query<
  ListSessionsByUserQuery,
  SessionRecordRow[]
> = async (ctx, query) => {
  const now = new Date();

  return ctx.db
    .select()
    .from(sessionRecordTable)
    .where(
      and(
        eq(sessionRecordTable.userId, query.userId),
        isNull(sessionRecordTable.revokedAt),
        gt(sessionRecordTable.expiresAt, now),
      ),
    )
    .orderBy(sessionRecordTable.createdAt);
};
