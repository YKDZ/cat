import * as z from "zod/v4";

export const ProjectSettingPayloadSchema = z.object({
  enableAutoTranslation: z.boolean().default(false),
  autoTranslationLanguages: z.array(z.string()).default([]),
  ghostTextFallback: z.enum(["first-memory", "none"]).default("none"),
});

export type ProjectSettingPayload = z.infer<typeof ProjectSettingPayloadSchema>;
