import type { User } from "@cat/shared";

import {
  executeQuery,
  getSessionStore,
  getUser,
  type DbHandle,
} from "@cat/domain";
import { UserSchema } from "@cat/shared";

export const userFromSessionId = async (
  drizzle: DbHandle,
  sessionId: string | null,
): Promise<User | null> => {
  if (!sessionId) return null;

  const sessionStore = getSessionStore();

  const userId = await sessionStore.getField(
    `user:session:${sessionId}`,
    "userId",
  );
  if (!userId) return null;

  const user = await executeQuery({ db: drizzle }, getUser, { userId });

  return UserSchema.nullable().parse(user);
};
