import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  voterId: z.uuidv7(),
  translationId: z.int(),
});

export const TranslationApprovementSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  translationId: z.int(),
  creatorId: z.uuidv7(),
});

export const TranslationSchema = z.object({
  id: z.int(),
  stringId: z.int(),
  meta: safeZDotJson.nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  translatorId: z.uuidv7(),
  translatableElementId: z.int(),
});

export type Translation = z.infer<typeof TranslationSchema>;
export type TranslationApprovement = z.infer<
  typeof TranslationApprovementSchema
>;
export type TranslationVote = z.infer<typeof TranslationVoteSchema>;
