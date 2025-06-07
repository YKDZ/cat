import { prisma } from "@cat/db";
import { redis } from "@cat/db";
import type { User} from "@cat/shared";
import { UserSchema } from "@cat/shared";

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
        Permissions: true,
        ReadableLanguages: true,
        WritableLanguages: true,
      },
    })
    .then((user) => {
      return UserSchema.parse(user);
    })
    .catch(() => null);
};
