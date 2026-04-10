import { getColumns, kanbanCard } from "@cat/db";
import { KanbanCardStatusSchema } from "@cat/shared/schema/enum";
import { safeZDotJson } from "@cat/shared/schema/json";
import { assertSingleNonNullish } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const CreateCardCommandSchema = z.object({
  boardId: z.int().positive(),
  columnId: z.string().default(""),
  title: z.string().min(1),
  description: z.string().default(""),
  priority: z.int().default(0),
  dueDate: z.date().optional(),
  labels: z.array(z.string()).default([]),
  linkedResourceType: z.string().optional(),
  linkedResourceId: z.string().optional(),
  status: KanbanCardStatusSchema.default("OPEN"),
  parentCardId: z.int().optional(),
  batchSize: z.int().positive().default(1),
  metadata: safeZDotJson.optional(),
});

export type CreateCardCommand = z.infer<typeof CreateCardCommandSchema>;

export const createCard: Command<
  CreateCardCommand,
  typeof kanbanCard.$inferSelect
> = async (ctx, command) => {
  const inserted = assertSingleNonNullish(
    await ctx.db
      .insert(kanbanCard)
      .values({
        boardId: command.boardId,
        columnId: command.columnId,
        title: command.title,
        description: command.description,
        priority: command.priority,
        dueDate: command.dueDate,
        labels: command.labels,
        linkedResourceType: command.linkedResourceType,
        linkedResourceId: command.linkedResourceId,
        status: command.status,
        parentCardId: command.parentCardId,
        batchSize: command.batchSize,
        metadata: command.metadata,
      })
      .returning({ ...getColumns(kanbanCard) }),
  );
  return { result: inserted, events: [] };
};
