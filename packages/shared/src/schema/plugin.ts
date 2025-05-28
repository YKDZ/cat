import z from "zod/v4";

export const PluginManifestSchema = z.object({
  id: z.string(),
  entry: z.string(),
  iconURL: z.url().optional(),
});

export const PluginDataSchema = PluginManifestSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
});

export type PluginManifestSchema = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
