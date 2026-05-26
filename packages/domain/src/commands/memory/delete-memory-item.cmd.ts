import { eq, memoryItem, memoryItemDeletion } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import { MemoryDeletionScopeValues } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const DeleteMemoryItemCommandSchema = z.object({
  memoryItemId: z.int(),
  deletedById: z.uuidv4().nullable().optional(),
  scope: z.enum(MemoryDeletionScopeValues),
  projectId: z.uuidv4().nullable().optional(),
  reason: z.string().trim().max(500).optional(),
});

export type DeleteMemoryItemCommand = z.infer<
  typeof DeleteMemoryItemCommandSchema
>;

export type DeleteMemoryItemResult = {
  deleted: boolean;
};

export const deleteMemoryItem: Command<
  DeleteMemoryItemCommand,
  DeleteMemoryItemResult
> = async (ctx, command) => {
  const existing = assertSingleOrNull(
    await ctx.db
      .select({
        id: memoryItem.id,
        memoryId: memoryItem.memoryId,
      })
      .from(memoryItem)
      .where(eq(memoryItem.id, command.memoryItemId))
      .limit(1),
  );

  if (!existing) {
    return { result: { deleted: false }, events: [] };
  }

  await ctx.db.insert(memoryItemDeletion).values({
    deletedMemoryItemId: existing.id,
    memoryId: existing.memoryId,
    projectId: command.projectId ?? null,
    deletedById: command.deletedById ?? null,
    scope: command.scope,
    reason: command.reason,
  });

  await ctx.db.delete(memoryItem).where(eq(memoryItem.id, existing.id));

  return { result: { deleted: true }, events: [] };
};
