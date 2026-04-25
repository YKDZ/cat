import { eq, getColumns, issueCommentThread } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const ResolveThreadCommandSchema = z.object({
  threadId: z.int().positive(),
  resolved: z.boolean().default(true),
});

export type ResolveThreadCommand = z.infer<typeof ResolveThreadCommandSchema>;

export const resolveThread: Command<
  ResolveThreadCommand,
  typeof issueCommentThread.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(issueCommentThread)
      .set({ isResolved: command.resolved })
      .where(eq(issueCommentThread.id, command.threadId))
      .returning({ ...getColumns(issueCommentThread) }),
  );

  return { result: updated, events: [] };
};
