import { getColumns, issueCommentThread } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateThreadCommandSchema = z.object({
  targetType: z.enum(["issue", "pr"]),
  targetId: z.int().positive(),
  isReviewThread: z.boolean().default(false),
  reviewContext: z
    .object({
      entityType: z.string(),
      entityId: z.string(),
      fieldPath: z.string(),
      changesetEntryId: z.int(),
    })
    .nullable()
    .optional(),
});

export type CreateThreadCommand = z.infer<typeof CreateThreadCommandSchema>;

export const createThread: Command<
  CreateThreadCommand,
  typeof issueCommentThread.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(issueCommentThread)
      .values({
        targetType: command.targetType,
        targetId: command.targetId,
        isReviewThread: command.isReviewThread,
        reviewContext: command.reviewContext ?? null,
      })
      .returning({ ...getColumns(issueCommentThread) }),
  );

  return { result: inserted, events: [] };
};
