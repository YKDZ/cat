import type { JSONType } from "@cat/shared/schema/json";

import { account, and, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetAccountMetaByProviderAndIdentifierSchema = z.object({
  providedAccountId: z.string(),
  providerIssuer: z.string(),
});

export type GetAccountMetaByProviderAndIdentifierQuery = z.infer<
  typeof GetAccountMetaByProviderAndIdentifierSchema
>;

export const getAccountMetaByProviderAndIdentifier: Query<
  GetAccountMetaByProviderAndIdentifierQuery,
  JSONType | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ meta: account.meta })
      .from(account)
      .where(
        and(
          eq(account.providedAccountId, query.providedAccountId),
          eq(account.providerIssuer, query.providerIssuer),
        ),
      )
      .limit(1),
  );

  return row?.meta ?? null;
};
