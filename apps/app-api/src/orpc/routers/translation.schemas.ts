import { TranslationSchema } from "@cat/shared";
import * as z from "zod";

const TranslationDataSchema = TranslationSchema.omit({
  updatedAt: true,
  stringId: true,
}).extend({
  vote: z.int(),
  text: z.string(),
});

/**
 * @zh 主线翻译 DTO。
 * @en DTO for a mainline translation.
 */
export const MainTranslationDataSchema = TranslationDataSchema.extend({
  kind: z.literal("main").default("main"),
});

/**
 * @zh 仅存在于分支 overlay 中的翻译 DTO。
 * @en DTO for a translation that only exists in a branch overlay.
 */
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

/**
 * @zh 可区分主线与分支 overlay 的翻译 DTO。
 * @en Branch-aware translation DTO that distinguishes mainline rows from branch overlays.
 */
export const BranchAwareTranslationDataSchema = z.discriminatedUnion("kind", [
  MainTranslationDataSchema,
  BranchOverlayTranslationDataSchema,
]);

/**
 * @zh 分支感知翻译 DTO 类型。
 * @en Branch-aware translation DTO type.
 */
export type BranchAwareTranslationData = z.infer<
  typeof BranchAwareTranslationDataSchema
>;
