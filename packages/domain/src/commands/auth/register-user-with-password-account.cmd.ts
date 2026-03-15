import { account, hashPassword, user } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const RegisterUserWithPasswordAccountCommandSchema = z.object({
  email: z.email(),
  name: z.string(),
  password: z.string(),
  authProviderId: z.int(),
});

export type RegisterUserWithPasswordAccountCommand = z.infer<
  typeof RegisterUserWithPasswordAccountCommandSchema
>;

export type RegisterUserWithPasswordAccountResult = {
  userId: string;
  providerIssuer: string;
  providedAccountId: string;
};

export const registerUserWithPasswordAccount: Command<
  RegisterUserWithPasswordAccountCommand,
  RegisterUserWithPasswordAccountResult
> = async (ctx, command) => {
  const insertedUser = assertSingleNonNullish(
    await ctx.db
      .insert(user)
      .values({
        email: command.email,
        name: command.name,
        emailVerified: false,
      })
      .returning({ id: user.id }),
  );

  const insertedAccount = assertSingleNonNullish(
    await ctx.db
      .insert(account)
      .values({
        userId: insertedUser.id,
        providerIssuer: "PASSWORD",
        providedAccountId: command.email,
        meta: {
          password: await hashPassword(command.password),
        },
        authProviderId: command.authProviderId,
      })
      .returning({
        providerIssuer: account.providerIssuer,
        providedAccountId: account.providedAccountId,
      }),
  );

  return {
    result: {
      userId: insertedUser.id,
      providerIssuer: insertedAccount.providerIssuer,
      providedAccountId: insertedAccount.providedAccountId,
    },
    events: [],
  };
};
