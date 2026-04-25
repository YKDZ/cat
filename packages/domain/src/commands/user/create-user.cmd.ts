import { user } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const CreateUserCommandSchema = z.object({
  email: z.email(),
  name: z.string(),
});

export type CreateUserCommand = z.infer<typeof CreateUserCommandSchema>;

export const createUser: Command<
  CreateUserCommand,
  typeof user.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(user)
      .values({
        email: command.email,
        name: command.name,
        emailVerified: false,
      })
      .returning(),
  );

  return {
    result: inserted,
    events: [domainEvent("user:created", { userId: inserted.id })],
  };
};
