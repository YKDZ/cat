import { sessionRecord as sessionRecordTable } from "@cat/db";
import type { ServiceImplementationReference } from "@cat/shared";

import type { Command } from "#/types.ts";

export interface CreateSessionRecordCommand {
  id: string;
  userId: string;
  ip: string | null;
  userAgent: string | null;
  authProvider: ServiceImplementationReference;
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
    authProvider: command.authProvider,
    expiresAt: command.expiresAt,
  });

  return {
    result: undefined,
    events: [],
  };
};
