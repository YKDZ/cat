import { prisma } from "@cat/db";
import { redis } from "../database/redis";
import { User, UserSchema } from "@cat/shared";

export const userFromSessionId = async (
  sessionId: string | null,
): Promise<User | null> => {
  if (!sessionId) return null;
  const userId = await redis.hGet(`user:session:${sessionId}`, "userId");
  if (!userId) return null;

  return await prisma.user
    .findFirst({
      where: {
        id: userId,
      },
      include: {
        ProjectPermissions: true,
        ReadableLanguages: true,
        WritableLanguages: true,
      },
    })
    .then((user) => {
      return UserSchema.parse(user);
    })
    .catch(() => null);
};
