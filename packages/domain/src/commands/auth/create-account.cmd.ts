import { account } from "@cat/db";
import {
  assertSingleNonNullish,
  safeZDotJson,
  ServiceImplementationReferenceSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const CreateAccountCommandSchema = z.object({
  userId: z.uuidv4(),
  authProvider: ServiceImplementationReferenceSchema,
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
        authProvider: command.authProvider,
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
