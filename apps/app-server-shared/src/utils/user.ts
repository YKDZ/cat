import {
  eq,
  getColumns,
  getRedisDB,
  DrizzleClient,
  user as userTable,
} from "@cat/db";
import type { User } from "@cat/shared/schema/drizzle/user";
import { UserSchema } from "@cat/shared/schema/drizzle/user";
import { assertSingleOrNull } from "@cat/shared/utils";

export const userFromSessionId = async (
  drizzle: DrizzleClient,
  sessionId: string | null,
): Promise<User | null> => {
  if (!sessionId) return null;

  const { redis } = await getRedisDB();

  const userId = await redis.hGet(`user:session:${sessionId}`, "userId");
  if (!userId) return null;

  const user = assertSingleOrNull(
    await drizzle
      .select(getColumns(userTable))
      .from(userTable)
      .where(eq(userTable.id, userId))
      .limit(1),
  );

  return UserSchema.nullable().parse(user);
};
