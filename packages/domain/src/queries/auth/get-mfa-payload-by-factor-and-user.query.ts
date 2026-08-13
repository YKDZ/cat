import { and, eq, mfaProvider } from "@cat/db";
import {
  assertSingleOrNull,
  type NonNullJSONType,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetMfaPayloadByFactorAndUserSchema = z.object({
  userId: z.uuidv4(),
  mfaService: ServiceImplementationReferenceSchema,
});

export type GetMfaPayloadByFactorAndUserQuery = z.infer<
  typeof GetMfaPayloadByFactorAndUserSchema
>;

export const getMfaPayloadByFactorAndUser: Query<
  GetMfaPayloadByFactorAndUserQuery,
  NonNullJSONType | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ payload: mfaProvider.payload })
      .from(mfaProvider)
      .where(
        and(
          eq(mfaProvider.userId, query.userId),
          eq(mfaProvider.mfaService, query.mfaService),
        ),
      )
      .limit(1),
  );

  return row?.payload ?? null;
};
