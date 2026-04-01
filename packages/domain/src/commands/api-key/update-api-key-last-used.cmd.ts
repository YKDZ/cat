import { apiKey as apiKeyTable } from "@cat/db";
import { eq } from "@cat/db";

import type { Command } from "@/types";

export interface UpdateApiKeyLastUsedCommand {
  id: number;
}

export const updateApiKeyLastUsed: Command<
  UpdateApiKeyLastUsedCommand
> = async (ctx, command) => {
  await ctx.db
    .update(apiKeyTable)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeyTable.id, command.id));

  return {
    result: undefined,
    events: [],
  };
};
