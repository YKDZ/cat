import { apiKey } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";

import type { Command } from "#/types.ts";

export interface CreateApiKeyCommand {
  name: string;
  keyHash: string;
  keyPrefix: string;
  userId: string;
  scopes: string[];
  expiresAt: Date | null;
}

export const createApiKey: Command<
  CreateApiKeyCommand,
  { id: number }
> = async (ctx, command) => {
  const result = assertSingleNonNullish(
    await ctx.db
      .insert(apiKey)
      .values({
        name: command.name,
        keyHash: command.keyHash,
        keyPrefix: command.keyPrefix,
        userId: command.userId,
        scopes: command.scopes,
        expiresAt: command.expiresAt,
      })
      .returning({ id: apiKey.id }),
  );

  return {
    result: { id: result.id },
    events: [],
  };
};
