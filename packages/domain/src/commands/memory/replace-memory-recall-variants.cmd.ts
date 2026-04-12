import type { JSONType } from "@cat/shared/schema/json";

import { and, eq, memoryRecallVariant } from "@cat/db";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const ReplaceMemoryRecallVariantsCommandSchema = z.object({
  memoryItemId: z.int(),
  memoryId: z.uuidv4(),
  languageId: z.string(),
  querySide: z.enum(["SOURCE", "TRANSLATION"]),
  variants: z.array(
    z.object({
      text: z.string(),
      normalizedText: z.string(),
      variantType: z.enum([
        "SURFACE",
        "CASE_FOLDED",
        "LEMMA",
        "TOKEN_TEMPLATE",
        "FRAGMENT",
      ]),
      meta: z.json().nullable().optional(),
    }),
  ),
});

export type ReplaceMemoryRecallVariantsCommand = z.infer<
  typeof ReplaceMemoryRecallVariantsCommandSchema
>;

/**
 * Idempotent replace: delete all existing variants for
 * (memoryItemId, languageId, querySide) and insert the new set.
 */
export const replaceMemoryRecallVariants: Command<
  ReplaceMemoryRecallVariantsCommand
> = async (ctx, command) => {
  // Delete existing variants for this memory item, language, and query side
  await ctx.db
    .delete(memoryRecallVariant)
    .where(
      and(
        eq(memoryRecallVariant.memoryItemId, command.memoryItemId),
        eq(memoryRecallVariant.languageId, command.languageId),
        eq(memoryRecallVariant.querySide, command.querySide),
      ),
    );

  // Insert new variants (if any)
  if (command.variants.length > 0) {
    await ctx.db.insert(memoryRecallVariant).values(
      command.variants.map((v) => ({
        memoryItemId: command.memoryItemId,
        memoryId: command.memoryId,
        languageId: command.languageId,
        querySide: command.querySide,
        text: v.text,
        normalizedText: v.normalizedText,
        variantType: v.variantType,
        meta: (v.meta ?? null) as JSONType | null,
      })),
    );
  }

  return { result: undefined, events: [] };
};
