import { and, eq, memory, memoryItem, personalMemoryBinding } from "@cat/db";
import { assertSingleOrNull } from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const FindPersonalMemoryItemForTranslationQuerySchema = z.object({
  translationId: z.int(),
  projectId: z.uuidv4(),
  userId: z.uuidv4(),
});

export type FindPersonalMemoryItemForTranslationQuery = z.infer<
  typeof FindPersonalMemoryItemForTranslationQuerySchema
>;

export type PersonalMemoryItemForTranslation = {
  id: number;
  memoryId: string;
};

export const findPersonalMemoryItemForTranslation: Query<
  FindPersonalMemoryItemForTranslationQuery,
  PersonalMemoryItemForTranslation | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      id: memoryItem.id,
      memoryId: memoryItem.memoryId,
    })
    .from(memoryItem)
    .innerJoin(
      personalMemoryBinding,
      eq(memoryItem.memoryId, personalMemoryBinding.memoryId),
    )
    .innerJoin(memory, eq(memory.id, memoryItem.memoryId))
    .where(
      and(
        eq(memoryItem.translationId, query.translationId),
        eq(personalMemoryBinding.projectId, query.projectId),
        eq(personalMemoryBinding.userId, query.userId),
        eq(memory.scope, "PERSONAL"),
      ),
    )
    .limit(1);

  return assertSingleOrNull(rows);
};
