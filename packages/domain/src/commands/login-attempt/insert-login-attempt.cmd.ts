import { loginAttempt as loginAttemptTable } from "@cat/db";

import type { Command } from "@/types";

export interface InsertLoginAttemptCommand {
  identifier: string;
  ip: string | null;
  userAgent: string | null;
  success: boolean;
  failReason: string | null;
}

export const insertLoginAttempt: Command<InsertLoginAttemptCommand> = async (
  ctx,
  command,
) => {
  await ctx.db.insert(loginAttemptTable).values({
    identifier: command.identifier,
    ip: command.ip,
    userAgent: command.userAgent,
    success: command.success,
    failReason: command.failReason,
  });

  return {
    result: undefined,
    events: [],
  };
};
