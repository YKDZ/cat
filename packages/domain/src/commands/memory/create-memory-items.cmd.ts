import { memoryItem } from "@cat/db";
import { safeZDotJson } from "@cat/shared/schema/json";
import * as z from "zod";

import type { Command } from "@/types";

const MemoryItemInputSchema = z.object({
  translationId: z.int().nullable(),
  translationStringId: z.int(),
  sourceStringId: z.int(),
  creatorId: z.string().nullable(),
  sourceTemplate: z.string().nullable(),
  translationTemplate: z.string().nullable(),
  slotMapping: safeZDotJson,
});

export const CreateMemoryItemsCommandSchema = z.object({
  memoryId: z.string(),
  items: z.array(MemoryItemInputSchema),
});

export type CreateMemoryItemsCommand = z.infer<
  typeof CreateMemoryItemsCommandSchema
>;

export type CreatedMemoryItemRow = {
  id: number;
  translationId: number | null;
  translationStringId: number;
  sourceStringId: number;
};

export const createMemoryItems: Command<
  CreateMemoryItemsCommand,
  CreatedMemoryItemRow[]
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
        slotMapping: item.slotMapping,
      })),
    )
    .returning({
      id: memoryItem.id,
      translationId: memoryItem.translationId,
      translationStringId: memoryItem.translationStringId,
      sourceStringId: memoryItem.sourceStringId,
    });

  return { result: inserted, events: [] };
};
