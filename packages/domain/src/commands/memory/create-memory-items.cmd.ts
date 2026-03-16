import { memoryItem } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

const MemoryItemInputSchema = z.object({
  translationId: z.int().nullable(),
  translationStringId: z.int(),
  sourceStringId: z.int(),
  creatorId: z.string().nullable(),
  sourceTemplate: z.string().nullable(),
  translationTemplate: z.string().nullable(),
  slotMapping: z.unknown().nullable(),
});

export const CreateMemoryItemsCommandSchema = z.object({
  memoryId: z.string(),
  items: z.array(MemoryItemInputSchema),
});

export type CreateMemoryItemsCommand = z.infer<
  typeof CreateMemoryItemsCommandSchema
>;

export type CreatedMemoryItemId = { id: number };

export const createMemoryItems: Command<
  CreateMemoryItemsCommand,
  number[]
> = async (ctx, command) => {
  if (command.items.length === 0) {
    return { result: [], events: [] };
  }

  const inserted = await ctx.db
    .insert(memoryItem)
    .values(
      command.items.map((item) => ({
        memoryId: command.memoryId,
        translationId: item.translationId,
        translationStringId: item.translationStringId,
        sourceStringId: item.sourceStringId,
        creatorId: item.creatorId,
        sourceTemplate: item.sourceTemplate,
        translationTemplate: item.translationTemplate,
        // oxlint-disable-next-line no-unsafe-type-assertion
        slotMapping: item.slotMapping as Record<string, unknown> | null,
      })),
    )
    .returning({ id: memoryItem.id });

  return { result: inserted.map((i) => i.id), events: [] };
};
