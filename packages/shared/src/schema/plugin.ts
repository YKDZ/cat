import { z } from "zod";
import { PluginConfigSchema } from "./prisma";

export const PluginConfigDataSchema = PluginConfigSchema.pick({
  key: true,
  overridable: true,
  schema: true,
});

export const PluginManifestSchema = z.object({
  id: z.string(),
  entry: z.string().optional(),
  iconURL: z.url().optional(),
  tags: z.array(z.string()).optional(),
  configs: z.array(PluginConfigDataSchema).optional(),
});

export const PluginDataSchema = PluginManifestSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
});

export type PluginManifestSchema = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
export type PluginConfigData = z.infer<typeof PluginConfigDataSchema>;
