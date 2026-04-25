import { account } from "@cat/db";
import { safeZDotJson } from "@cat/shared";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const CreateAccountCommandSchema = z.object({
  userId: z.uuidv4(),
  authProviderId: z.int(),
  providerIssuer: z.string(),
  providedAccountId: z.string(),
  accountMeta: safeZDotJson.optional(),
});

export type CreateAccountCommand = z.infer<typeof CreateAccountCommandSchema>;

export type CreateAccountResult = {
  providerIssuer: string;
  providedAccountId: string;
};

export const createAccount: Command<
  CreateAccountCommand,
  CreateAccountResult
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(account)
      .values({
        userId: command.userId,
        authProviderId: command.authProviderId,
        providerIssuer: command.providerIssuer,
        providedAccountId: command.providedAccountId,
        meta: command.accountMeta,
      })
      .returning({
        providerIssuer: account.providerIssuer,
        providedAccountId: account.providedAccountId,
      }),
  );

  return {
    result: inserted,
    events: [],
  };
};
