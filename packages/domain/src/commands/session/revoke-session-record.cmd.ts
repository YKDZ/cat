import { sessionRecord as sessionRecordTable } from "@cat/db";
import { and, eq } from "@cat/db";

import type { Command } from "@/types";

export interface RevokeSessionRecordCommand {
  id: string;
  userId: string;
}

export const revokeSessionRecord: Command<RevokeSessionRecordCommand> = async (
  ctx,
  command,
) => {
  await ctx.db
    .update(sessionRecordTable)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessionRecordTable.id, command.id),
        eq(sessionRecordTable.userId, command.userId),
      ),
    );

  return {
    result: undefined,
    events: [],
  };
};
