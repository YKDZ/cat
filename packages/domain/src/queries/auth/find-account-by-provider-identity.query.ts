import { account, and, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const FindAccountByProviderIdentityQuerySchema = z.object({
  providerIssuer: z.string(),
  providedAccountId: z.string(),
  authProviderId: z.int(),
});

export type FindAccountByProviderIdentityQuery = z.infer<
  typeof FindAccountByProviderIdentityQuerySchema
>;

export type AccountIdentity = {
  userId: string;
  providerIssuer: string;
  providedAccountId: string;
};

export const findAccountByProviderIdentity: Query<
  FindAccountByProviderIdentityQuery,
  AccountIdentity | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({
        userId: account.userId,
        providerIssuer: account.providerIssuer,
        providedAccountId: account.providedAccountId,
      })
      .from(account)
      .where(
        and(
          eq(account.providerIssuer, query.providerIssuer),
          eq(account.providedAccountId, query.providedAccountId),
          eq(account.authProviderId, query.authProviderId),
        ),
      ),
  );
};
