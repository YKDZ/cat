import { and, eq, mfaProvider } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod";

import type { Query } from "@/types";

export const GetMfaProviderByServiceAndUserQuerySchema = z.object({
  userId: z.uuidv4(),
  mfaServiceId: z.int(),
});

export type GetMfaProviderByServiceAndUserQuery = z.infer<
  typeof GetMfaProviderByServiceAndUserQuerySchema
>;

export const getMfaProviderByServiceAndUser: Query<
  GetMfaProviderByServiceAndUserQuery,
  typeof mfaProvider.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select()
      .from(mfaProvider)
      .where(
        and(
          eq(mfaProvider.userId, query.userId),
          eq(mfaProvider.mfaServiceId, query.mfaServiceId),
        ),
      ),
  );
};
