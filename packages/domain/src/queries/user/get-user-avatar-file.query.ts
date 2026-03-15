import { and, blob, eq, file, user } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetUserAvatarFileQuerySchema = z.object({
  userId: z.uuidv4(),
});

export type GetUserAvatarFileQuery = z.infer<
  typeof GetUserAvatarFileQuerySchema
>;

export type UserAvatarFileRef = {
  key: string;
  storageProviderId: number;
};

export const getUserAvatarFile: Query<
  GetUserAvatarFileQuery,
  UserAvatarFileRef | null
> = async (ctx, query) => {
  const row = assertSingleOrNull(
    await ctx.db
      .select({
        key: blob.key,
        storageProviderId: blob.storageProviderId,
      })
      .from(user)
      .innerJoin(
        file,
        and(eq(user.avatarFileId, file.id), eq(file.isActive, true)),
      )
      .innerJoin(blob, eq(file.blobId, blob.id))
      .where(eq(user.id, query.userId)),
  );

  if (!row) {
    return null;
  }

  return row;
};
