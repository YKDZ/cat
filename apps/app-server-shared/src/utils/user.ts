import { getPrismaDB, getRedisDB } from "@cat/db";
import type { User } from "@cat/shared/schema/prisma/user";
import { UserSchema } from "@cat/shared/schema/prisma/user";

export const userFromSessionId = async (
  sessionId: string | null,
): Promise<User | null> => {
  if (!sessionId) return null;

  const { redis } = await getRedisDB();

  const userId = await redis.hGet(`user:session:${sessionId}`, "userId");
  if (!userId) return null;

  const { client: prisma } = await getPrismaDB();

  return UserSchema.nullable().parse(
    await prisma.user.findUnique({
      where: {
        id: userId,
      },
      include: {
        UserRoles: {
          include: {
            Role: {
              include: {
                RolePermissions: {
                  include: {
                    Permission: true,
                  },
                },
              },
            },
          },
        },
        ReadableLanguages: true,
        WritableLanguages: true,
      },
    }),
  );
};
