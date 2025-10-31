import * as z from "zod/v4";
import { JSONSchemaSchema } from "@/schema/json.ts";

export const PluginManifestSchema = z.object({
  id: z.string(),
  version: z.string(),
  entry: z.string(),
  iconURL: z.url().optional(),
  services: z
    .array(
      z.object({
        id: z.string(),
        type: z.enum([
          "TRANSLATION_ADVISOR",
          "STORAGE_PROVIDER",
          "AUTH_PROVIDER",
          "TERM_SERVICE",
          "TRANSLATABLE_FILE_HANDLER",
          "TEXT_VECTORIZER",
          "VECTOR_STORAGE",
        ]),
      }),
    )
    .optional(),
  config: JSONSchemaSchema.optional(),
});

export const PluginDataSchema = PluginManifestSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
