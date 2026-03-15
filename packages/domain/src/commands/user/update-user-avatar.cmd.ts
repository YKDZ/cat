import { eq, user } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdateUserAvatarCommandSchema = z.object({
  userId: z.uuidv4(),
  fileId: z.int(),
});

export type UpdateUserAvatarCommand = z.infer<
  typeof UpdateUserAvatarCommandSchema
>;

export const updateUserAvatar: Command<UpdateUserAvatarCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(user)
    .set({ avatarFileId: command.fileId })
    .where(eq(user.id, command.userId));

  return {
    result: undefined,
    events: [domainEvent("user:updated", { userId: command.userId })],
  };
};
