import type { NonNullJSONType } from "@cat/shared/schema/json";

import { and, eq, mfaProvider, pluginService } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetMfaPayloadByFactorAndUserSchema = z.object({
  userId: z.uuidv4(),
  factorId: z.string(),
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
      .innerJoin(pluginService, eq(mfaProvider.mfaServiceId, pluginService.id))
      .where(
        and(
          eq(mfaProvider.userId, query.userId),
          eq(pluginService.serviceId, query.factorId),
        ),
      )
      .limit(1),
  );

  return row?.payload ?? null;
};
