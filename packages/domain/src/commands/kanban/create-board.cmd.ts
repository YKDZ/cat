import { getColumns, kanbanBoard } from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateBoardCommandSchema = z.object({
  name: z.string().min(1),
  orgId: z.uuid().optional(),
  columns: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
      }),
    )
    .default([]),
  linkedResourceType: z.string().optional(),
  linkedResourceId: z.string().optional(),
  metadata: safeZDotJson.optional(),
});

export type CreateBoardCommand = z.infer<typeof CreateBoardCommandSchema>;

export const createBoard: Command<
  CreateBoardCommand,
  typeof kanbanBoard.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(kanbanBoard)
      .values({
        name: command.name,
        orgId: command.orgId,
        columns: command.columns,
        linkedResourceType: command.linkedResourceType,
        linkedResourceId: command.linkedResourceId,
        metadata: command.metadata,
      })
      .returning({ ...getColumns(kanbanBoard) }),
  );
  return { result: inserted, events: [] };
};
