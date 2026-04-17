import { eq, getColumns, pullRequest } from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

import { domainEvent } from "@/events/domain-events";

export const UpdatePRCommandSchema = z.object({
  prId: z.int().positive(),
  title: z.string().min(1).optional(),
  body: z.string().optional(),
  reviewers: z
    .array(z.object({ type: z.enum(["user", "agent"]), id: z.string() }))
    .optional(),
  metadata: safeZDotJson.optional(),
});

export type UpdatePRCommand = z.infer<typeof UpdatePRCommandSchema>;

/**
 * @zh 更新 PR 标题、正文或 reviewers 列表。
 * @en Update a PR's title, body, or reviewers list.
 */
export const updatePR: Command<
  UpdatePRCommand,
  typeof pullRequest.$inferSelect
> = async (ctx, command) => {
  const updated = assertSingleNonNullish(
    await ctx.db
      .update(pullRequest)
      .set({
        title: command.title,
        body: command.body,
        reviewers: command.reviewers,
        metadata: command.metadata,
      })
      .where(eq(pullRequest.id, command.prId))
      .returning({ ...getColumns(pullRequest) }),
  );

  return {
    result: updated,
    events: [domainEvent("pr:updated", { prId: command.prId })],
  };
};
