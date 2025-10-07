import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  voterId: z.uuidv7(),
  translationId: z.int(),
});

export const TranslationApprovementSchema = z.object({
  id: z.int(),
  isActive: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  translationId: z.int(),

  creatorId: z.uuidv7(),
});

export const TranslationSchema = z.object({
  id: z.int(),
  value: z.string(),
  meta: safeZDotJson.nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  translatorId: z.uuidv7(),
  translatableElementId: z.int(),
  languageId: z.string(),
  embeddingId: z.int(),
});

export type Translation = z.infer<typeof TranslationSchema>;
export type TranslationApprovement = z.infer<
  typeof TranslationApprovementSchema
>;
export type TranslationVote = z.infer<typeof TranslationVoteSchema>;
