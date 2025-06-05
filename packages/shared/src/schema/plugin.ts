import z from "zod/v4";
import { PluginConfigSchema } from "./prisma";

export const PluginConfigDataSchema = PluginConfigSchema.omit({
  id: true,
  value: true,
  createdAt: true,
  updatedAt: true,
  pluginId: true,
});

export const PluginManifestSchema = z.object({
  id: z.string(),
  entry: z.string(),
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
