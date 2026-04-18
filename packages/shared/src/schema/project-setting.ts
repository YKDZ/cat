import * as z from "zod/v4";

export const ProjectSettingPayloadSchema = z.object({
  enableAutoTranslation: z.boolean().default(false),
  autoTranslationLanguages: z.array(z.string()).default([]),
  ghostTextFallback: z.enum(["first-memory", "none"]).default("none"),
});

export type ProjectSettingPayload = z.infer<typeof ProjectSettingPayloadSchema>;

/**
 * 用于部分更新的 Schema，不含 .default()，避免 Zod v4 partial() 填充默认值覆盖已有设置。
 *
 * Patch schema for partial updates — omits .default() to prevent Zod v4's
 * partial() from filling in default values that would overwrite existing settings.
 */
export const ProjectSettingPatchSchema = z
  .object({
    enableAutoTranslation: z.boolean(),
    autoTranslationLanguages: z.array(z.string()),
    ghostTextFallback: z.enum(["first-memory", "none"]),
  })
  .partial();
