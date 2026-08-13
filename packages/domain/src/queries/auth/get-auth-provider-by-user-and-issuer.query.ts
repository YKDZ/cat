import { account, and, eq } from "@cat/db";
import {
  assertSingleOrNull,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetAuthProviderByUserAndIssuerQuerySchema = z.strictObject({
  userId: z.uuidv4(),
  providerIssuer: z.string().min(1),
});

export type GetAuthProviderByUserAndIssuerQuery = z.infer<
  typeof GetAuthProviderByUserAndIssuerQuerySchema
>;

/** The account record is the source of truth for a user's primary provider. */
export const getAuthProviderByUserAndIssuer: Query<
  GetAuthProviderByUserAndIssuerQuery,
  z.infer<typeof ServiceImplementationReferenceSchema> | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ authProvider: account.authProvider })
      .from(account)
      .where(
        and(
          eq(account.userId, query.userId),
          eq(account.providerIssuer, query.providerIssuer),
        ),
      ),
  );

  return row?.authProvider ?? null;
};
