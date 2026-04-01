import { sessionRecord as sessionRecordTable } from "@cat/db";

import type { Command } from "@/types";

export interface CreateSessionRecordCommand {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  authProviderId: number | null;
  expiresAt: Date;
}

export const createSessionRecord: Command<CreateSessionRecordCommand> = async (
  ctx,
  command,
) => {
  await ctx.db.insert(sessionRecordTable).values({
    id: command.id,
    userId: command.userId,
    ip: command.ip,
    userAgent: command.userAgent,
    authProviderId: command.authProviderId,
    expiresAt: command.expiresAt,
  });

  return {
    result: undefined,
    events: [],
  };
};
