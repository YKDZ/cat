import { eq, or, user } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const FindUserByIdentifierQuerySchema = z.object({
  identifier: z.string(),
});

export type FindUserByIdentifierQuery = z.infer<
  typeof FindUserByIdentifierQuerySchema
>;

export type AuthUserIdentity = {
  id: string;
};

export const findUserByIdentifier: Query<
  FindUserByIdentifierQuery,
  AuthUserIdentity | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db
      .select({ id: user.id })
      .from(user)
      .where(
        or(eq(user.email, query.identifier), eq(user.name, query.identifier)),
      ),
  );
};
