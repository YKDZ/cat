import { TranslationSchema } from "@cat/shared";
import * as z from "zod";

const TranslationDataSchema = TranslationSchema.omit({
  updatedAt: true,
  stringId: true,
}).extend({
  vote: z.int(),
  text: z.string(),
});

export const MainTranslationDataSchema = TranslationDataSchema.extend({
  kind: z.literal("main").default("main"),
});

export const BranchOverlayTranslationDataSchema = z.object({
  kind: z.literal("branch-overlay"),
  overlayEntityId: z.string(),
  translatableElementId: z.int(),
  languageId: z.string(),
  text: z.string(),
  translatorId: z.uuidv4().nullable(),
  approved: z.boolean().default(false),
  vote: z.literal(0),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});

export const BranchAwareTranslationDataSchema = z.discriminatedUnion("kind", [
  MainTranslationDataSchema,
  BranchOverlayTranslationDataSchema,
]);

export type BranchAwareTranslationData = z.infer<
  typeof BranchAwareTranslationDataSchema
>;
