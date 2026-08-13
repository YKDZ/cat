import { account, and, eq } from "@cat/db";
import {
  assertSingleOrNull,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const FindAccountByProviderIdentityQuerySchema = z.object({
  providerIssuer: z.string(),
  providedAccountId: z.string(),
  authProvider: ServiceImplementationReferenceSchema,
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
          eq(account.authProvider, query.authProvider),
        ),
      ),
  );
};
