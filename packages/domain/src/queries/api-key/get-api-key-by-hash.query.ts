import { apiKey as apiKeyTable } from "@cat/db";
import { and, eq, isNull } from "@cat/db";

import type { Query } from "@/types";

export interface GetApiKeyByHashQuery {
  keyHash: string;
}

export interface ApiKeyRow {
  id: number;
  name: string;
  keyHash: string;
  keyPrefix: string;
  userId: string;
  scopes: string[];
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const getApiKeyByHash: Query<
  GetApiKeyByHashQuery,
  ApiKeyRow | null
> = async (ctx, query) => {
  const [result] = await ctx.db
    .select()
    .from(apiKeyTable)
    .where(
      and(
        eq(apiKeyTable.keyHash, query.keyHash),
        isNull(apiKeyTable.revokedAt),
      ),
    )
    .limit(1);

  return result ?? null;
};
