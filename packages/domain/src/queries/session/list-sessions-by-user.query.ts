import { sessionRecord as sessionRecordTable } from "@cat/db";
import { and, eq, gt, isNull } from "@cat/db";
import type { ServiceImplementationReference } from "@cat/shared";

import type { Query } from "#/types.ts";

export interface ListSessionsByUserQuery {
  userId: string;
}

export interface SessionRecordRow {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  authProvider: ServiceImplementationReference;
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
