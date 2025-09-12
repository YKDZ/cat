import { JSONSchemaSchema } from "@/schema/json.ts";
import { z } from "zod";

export const PluginManifestSchema = z.object({
  id: z.string(),
  entry: z.string(),
  iconURL: z.url().optional(),
  tags: z.array(z.string()).optional(),
  config: JSONSchemaSchema.optional(),
});

export const PluginDataSchema = PluginManifestSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
