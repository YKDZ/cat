import { defineTask } from "@/core";
import {
  getDrizzleDB,
  inArray,
  memoryItem,
  translatableElement,
  translation,
} from "@cat/db";
import z from "zod";

export const CreateMemoryItemInputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryIds: z.array(z.uuidv4()),
});

export const CreateMemoryItemOutputSchema = z.object({
  memoryItemIds: z.array(z.int()),
});

export const createMemoryItemTask = await defineTask({
  name: "memory-item.create",
  input: CreateMemoryItemInputSchema,
  output: CreateMemoryItemOutputSchema,

  handler: async (data) => {
    const { client: drizzle } = await getDrizzleDB();

    if (data.translationIds.length === 0 || data.memoryIds.length === 0) {
      return { memoryItemIds: [] };
    }

    const memoryItemIds = await drizzle.transaction(async (tx) => {
      const translations = await tx
        .select({
          translationId: translation.id,
          translationStringId: translation.stringId,
          sourceStringId: translatableElement.translatableStringId,
          creatorId: translation.translatorId,
        })
        .from(translation)
        .where(inArray(translation.id, data.translationIds));

      const ids: number[] = [];

      await Promise.all(
        data.memoryIds.map(async (memoryId) => {
          const inserted = await tx
            .insert(memoryItem)
            .values(
              translations.map((t) => ({
                ...t,
                memoryId,
              })),
            )
            .returning({ id: memoryItem.id });
          ids.push(...inserted.map((i) => i.id));
        }),
      );

      return ids;
    });

    return { memoryItemIds };
  },
});
