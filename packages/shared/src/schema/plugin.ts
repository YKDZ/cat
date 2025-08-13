import { z } from "zod";
import { PluginComponentSchema, PluginConfigSchema } from "./prisma";

export const PluginConfigDataSchema = PluginConfigSchema.pick({
  key: true,
  overridable: true,
  schema: true,
});

export const PluginComponentDataSchema = PluginComponentSchema.pick({
  id: true,
  entry: true,
  mountOn: true,
});

export const PluginManifestSchema = z.object({
  id: z.string(),
  entry: z.string().optional(),
  iconURL: z.url().optional(),
  tags: z.array(z.string()).optional(),
  configs: z.array(PluginConfigDataSchema).optional(),
  components: z.array(PluginComponentDataSchema).optional(),
});

export const PluginDataSchema = PluginManifestSchema.extend({
  name: z.string().lowercase(),
  version: z.string(),
  overview: z.string().nullable(),
});

export type PluginManifestSchema = z.infer<typeof PluginManifestSchema>;
export type PluginData = z.infer<typeof PluginDataSchema>;
export type PluginConfigData = z.infer<typeof PluginConfigDataSchema>;
export type PluginComponentData = z.infer<typeof PluginComponentDataSchema>;
