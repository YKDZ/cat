import { getRedisDB, OverallDrizzleClient } from "@cat/db";
import type { User } from "@cat/shared/schema/prisma/user";
import { UserSchema } from "@cat/shared/schema/prisma/user";

export const userFromSessionId = async (
  drizzle: OverallDrizzleClient,
  sessionId: string | null,
): Promise<User | null> => {
  if (!sessionId) return null;

  const { redis } = await getRedisDB();

  const userId = await redis.hGet(`user:session:${sessionId}`, "userId");
  if (!userId) return null;

  const user =
    (await drizzle.query.user.findFirst({
      where: (user, { eq }) => eq(user.id, userId),
    })) ?? null;

  return UserSchema.nullable().parse(user);
};
