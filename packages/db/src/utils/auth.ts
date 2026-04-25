import type { JSONType } from "@cat/shared";

import { assertSingleOrNull } from "@cat/shared";
import { and, eq } from "drizzle-orm";

import type { DrizzleClient, DrizzleTransaction } from "@/drizzle/db.ts";

import { account } from "@/drizzle/schema.ts";

export const getAccountMetaByIdentity = async (
  drizzle: DrizzleClient | DrizzleTransaction,
  userId: string,
  providedAccountId: string,
  providerIssuer: string,
): Promise<JSONType | null> => {
  const row = assertSingleOrNull(
    await drizzle
      .select({ meta: account.meta })
      .from(account)
      .where(
        and(
          eq(account.userId, userId),
          eq(account.providedAccountId, providedAccountId),
          eq(account.providerIssuer, providerIssuer),
        ),
      )
      .limit(1),
  );

  return row?.meta ?? null;
};
