import { apiKey, eq, and } from "@cat/db";

import type { Command } from "@/types";

export interface RevokeApiKeyCommand {
  id: number;
  userId: string;
}

export const revokeApiKey: Command<RevokeApiKeyCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(apiKey)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKey.id, command.id), eq(apiKey.userId, command.userId)));

  return {
    result: undefined,
    events: [],
  };
};
