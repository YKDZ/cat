import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const TranslationVoteSchema = z.object({
  id: z.int(),
  value: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  voterId: z.uuidv4(),
  translationId: z.int(),
});

export const TranslationSchema = z.object({
  id: z.int(),
  stringId: z.int(),
  meta: safeZDotJson,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  translatorId: z.uuidv4().nullable(),
  translatableElementId: z.int(),
});

export type Translation = z.infer<typeof TranslationSchema>;
export type TranslationVote = z.infer<typeof TranslationVoteSchema>;
