import { eq, user } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdateUserCommandSchema = z.object({
  userId: z.uuidv4(),
  name: z.string().min(1),
});

export type UpdateUserCommand = z.infer<typeof UpdateUserCommandSchema>;

export const updateUser: Command<
  UpdateUserCommand,
  typeof user.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(user)
      .set({ name: command.name })
      .where(eq(user.id, command.userId))
      .returning(),
  );

  return {
    result: updated,
    events: [domainEvent("user:updated", { userId: command.userId })],
  };
};
