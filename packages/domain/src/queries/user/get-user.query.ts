import { eq, user } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetUserQuerySchema = z.object({
  userId: z.uuidv4(),
});

export type GetUserQuery = z.infer<typeof GetUserQuerySchema>;

export const getUser: Query<
  GetUserQuery,
  typeof user.$inferSelect | null
> = async (ctx, query) => {
  return assertSingleOrNull(
    await ctx.db.select().from(user).where(eq(user.id, query.userId)),
  );
};
