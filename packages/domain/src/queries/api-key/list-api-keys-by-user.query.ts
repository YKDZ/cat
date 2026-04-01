import { apiKey as apiKeyTable } from "@cat/db";
import { and, eq, isNull } from "@cat/db";

import type { Query } from "@/types";

import type { ApiKeyRow } from "./get-api-key-by-hash.query.ts";

export interface ListApiKeysByUserQuery {
  userId: string;
}

export const listApiKeysByUser: Query<
  ListApiKeysByUserQuery,
  ApiKeyRow[]
> = async (ctx, query) => {
  return ctx.db
    .select()
    .from(apiKeyTable)
    .where(
      and(eq(apiKeyTable.userId, query.userId), isNull(apiKeyTable.revokedAt)),
    )
    .orderBy(apiKeyTable.createdAt);
};
