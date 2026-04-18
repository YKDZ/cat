import type { JSONType } from "@cat/shared/schema/json";

import { account, and, eq } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetAccountMetaByIdentitySchema = z.object({
  userId: z.uuidv4(),
  providedAccountId: z.string(),
  providerIssuer: z.string(),
});

export type GetAccountMetaByIdentityQuery = z.infer<
  typeof GetAccountMetaByIdentitySchema
>;

export const getAccountMetaByIdentity: Query<
  GetAccountMetaByIdentityQuery,
  JSONType | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ meta: account.meta })
      .from(account)
      .where(
        and(
          eq(account.userId, query.userId),
          eq(account.providedAccountId, query.providedAccountId),
          eq(account.providerIssuer, query.providerIssuer),
        ),
      )
      .limit(1),
  );

  return row?.meta ?? null;
};
