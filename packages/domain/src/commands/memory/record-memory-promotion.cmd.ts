import { eq, memoryPromotionRecord } from "@cat/db";
import { assertSingleOrNull, MemoryPromotionStatusValues } from "@cat/shared";
import * as z from "zod";

import type { Command } from "@/types";

export const RecordMemoryPromotionCommandSchema = z.object({
  projectId: z.uuidv4(),
  sourceTranslationId: z.int(),
  sourcePersonalMemoryItemId: z.int().nullable().optional(),
  targetMemoryId: z.uuidv4().nullable().optional(),
  targetMemoryItemId: z.int().nullable().optional(),
  approvedById: z.uuidv4().nullable().optional(),
  status: z.enum(MemoryPromotionStatusValues),
  idempotencyKey: z.string().min(1),
});

export type RecordMemoryPromotionCommand = z.infer<
  typeof RecordMemoryPromotionCommandSchema
>;

export type RecordMemoryPromotionResult = {
  id: number;
  created: boolean;
};

export const recordMemoryPromotion: Command<
  RecordMemoryPromotionCommand,
  RecordMemoryPromotionResult
> = async (ctx, command) => {
  const inserted = await ctx.db
    .insert(memoryPromotionRecord)
    .values({
      projectId: command.projectId,
      sourceTranslationId: command.sourceTranslationId,
      sourcePersonalMemoryItemId: command.sourcePersonalMemoryItemId ?? null,
      targetMemoryId: command.targetMemoryId ?? null,
      targetMemoryItemId: command.targetMemoryItemId ?? null,
      approvedById: command.approvedById ?? null,
      status: command.status,
      idempotencyKey: command.idempotencyKey,
    })
    .onConflictDoNothing()
    .returning({ id: memoryPromotionRecord.id });

  if (inserted[0]) {
    return { result: { id: inserted[0].id, created: true }, events: [] };
  }

  const existing = assertSingleOrNull(
    await ctx.db
      .select({ id: memoryPromotionRecord.id })
      .from(memoryPromotionRecord)
      .where(eq(memoryPromotionRecord.idempotencyKey, command.idempotencyKey))
      .limit(1),
  );

  if (!existing) {
    throw new Error("memory promotion record was not created");
  }

  return { result: { id: existing.id, created: false }, events: [] };
};
