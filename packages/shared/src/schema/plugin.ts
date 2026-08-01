import * as z from "zod";

import { PluginServiceTypeSchema } from "#/schema/enum.ts";
import { JSONSchemaSchema, nonNullSafeZDotJson } from "#/schema/json.ts";
import { PluginIdentifierSchema } from "#/schema/plugin-identifier.ts";
import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";

const PluginManifestBaseSchema = z.object({
  id: PluginIdentifierSchema,
  version: z.string(),
  entry: z.string(),
  iconURL: z.url().optional(),
  services: z
    .array(
      z
        .object({
          id: z.string().optional(),
          type: PluginServiceTypeSchema,
          dynamic: z.boolean().optional().default(false),
        })
        .refine(
          (s) => s.dynamic || s.id !== undefined,
          "Static services must have an id",
        ),
    )
    .optional(),
  components: z
    .array(
      z.object({
        id: z.string(),
        slot: z.string(),
        url: z.string(),
        skeletion: z.string().optional(),
      }),
    )
    .optional(),
  config: JSONSchemaSchema.optional(),
  configVersion: z
    .string()
    .min(1)
    .refine((version) => version !== "legacy-unverified")
    .optional(),
});

const requireConfigVersion = (
  manifest: z.infer<typeof PluginManifestBaseSchema>,
  context: z.RefinementCtx,
): void => {
  if (manifest.config !== undefined && manifest.configVersion === undefined) {
    context.addIssue({
      code: "custom",
      message: "Plugins that declare configuration must declare configVersion",
      path: ["configVersion"],
    });
  }
};

export const PluginManifestSchema =
  PluginManifestBaseSchema.superRefine(requireConfigVersion);

export const PluginDataSchema = PluginManifestBaseSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
}).superRefine(requireConfigVersion);

export const TranslationAdviseSchema = z.object({
  translation: z.string(),
  confidence: z.number().min(0).max(1),
  meta: nonNullSafeZDotJson.optional(),
});

export const TranslationSuggestionSchema = TranslationAdviseSchema.extend({
  advisor: ServiceImplementationReferenceSchema.optional(),
});

export type TranslationAdvise = z.infer<typeof TranslationAdviseSchema>;
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
export type TranslationSuggestion = z.infer<typeof TranslationSuggestionSchema>;
