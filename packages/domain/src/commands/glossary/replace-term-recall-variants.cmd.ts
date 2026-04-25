import type { JSONType } from "@cat/shared";

import { and, eq, termRecallVariant } from "@cat/db";
import * as z from "zod";

import type { Command } from "@/types";

export const ReplaceTermRecallVariantsCommandSchema = z.object({
  conceptId: z.int(),
  languageId: z.string(),
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

export type ReplaceTermRecallVariantsCommand = z.infer<
  typeof ReplaceTermRecallVariantsCommandSchema
>;

/**
 * Idempotent replace: delete all existing variants for (conceptId, languageId)
 * and insert the new set in a single transaction.
 *
 * Designed to be called after term content changes. Passing an empty
 * `variants` array is a valid "clear" operation.
 */
export const replaceTermRecallVariants: Command<
  ReplaceTermRecallVariantsCommand
> = async (ctx, command) => {
  // Delete existing variants for this concept + language
  await ctx.db
    .delete(termRecallVariant)
    .where(
      and(
        eq(termRecallVariant.conceptId, command.conceptId),
        eq(termRecallVariant.languageId, command.languageId),
      ),
    );

  // Insert new variants (if any)
  if (command.variants.length > 0) {
    await ctx.db.insert(termRecallVariant).values(
      command.variants.map((v) => ({
        conceptId: command.conceptId,
        languageId: command.languageId,
        text: v.text,
        normalizedText: v.normalizedText,
        variantType: v.variantType,
        meta: (v.meta ?? null) as JSONType | null,
      })),
    );
  }

  return { result: undefined, events: [] };
};
