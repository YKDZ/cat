import { and, eq, mfaProvider, sql } from "@cat/db";
import {
  assertSingleOrNull,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "#/types.ts";

export const GetMfaServiceByFactorAndUserQuerySchema = z.strictObject({
  userId: z.uuidv4(),
  factorId: z.string().min(1),
});

export type GetMfaServiceByFactorAndUserQuery = z.infer<
  typeof GetMfaServiceByFactorAndUserQuerySchema
>;

/** Select the user's configured MFA implementation before executing it. */
export const getMfaServiceByFactorAndUser: Query<
  GetMfaServiceByFactorAndUserQuery,
  z.infer<typeof ServiceImplementationReferenceSchema> | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({ mfaService: mfaProvider.mfaService })
      .from(mfaProvider)
      .where(
        and(
          eq(mfaProvider.userId, query.userId),
          sql`${mfaProvider.mfaService}->>'serviceId' = ${query.factorId}`,
        ),
      ),
  );

  return row?.mfaService ?? null;
};
