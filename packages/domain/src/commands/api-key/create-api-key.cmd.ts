import { apiKey } from "@cat/db";

import type { Command } from "@/types";

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
  const [result] = await ctx.db
    .insert(apiKey)
    .values({
      name: command.name,
      keyHash: command.keyHash,
      keyPrefix: command.keyPrefix,
      userId: command.userId,
      scopes: command.scopes,
      expiresAt: command.expiresAt,
    })
    .returning({ id: apiKey.id });

  return {
    result: { id: result.id },
    events: [],
  };
};
