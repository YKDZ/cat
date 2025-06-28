import z from "zod/v4";
import type { JSONSchema } from "zod/v4/core";
import { PrimsaDateTime } from "../misc";

export const PluginTagSchema = z.object({
  id: z.int(),
  name: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
});

export const PluginConfigSchema = z.object({
  id: z.int(),
  key: z.string(),
  value: z.json(),
  userOverridable: z.boolean().default(false),
  schema: z.custom<JSONSchema.JSONSchema>(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),
});

export const PluginUserConfigInstanceSchema = z.object({
  id: z.int(),
  value: z.json(),
  isActive: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  creatorId: z.ulid(),
  configId: z.int(),
});

export const PluginPermissionSchema = z.object({
  id: z.int(),
  permission: z.string(),
  description: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),
});

export const PluginVersionSchema = z.object({
  id: z.int(),
  version: z.string(),
  pluginId: z.string(),
});

export const PluginComponentSchema = z.object({
  id: z.string(),
  entry: z.string(),
  mountOn: z.string(),
  pluginId: z.string(),
});

export const PluginSchema = z.object({
  id: z.string(),
  origin: z.json(),
  name: z.string(),
  overview: z.string().nullable(),
  enabled: z.boolean(),
  iconURL: z.url().nullable(),
  isExternal: z.boolean(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  get Configs() {
    return z.array(PluginConfigSchema).optional();
  },
  get Permissions() {
    return z.array(PluginPermissionSchema).optional();
  },
  get Versions() {
    return z.array(PluginVersionSchema).optional();
  },
  get Tags() {
    return z.array(PluginTagSchema).optional();
  },
});

export type PluginTag = z.infer<typeof PluginTagSchema>;
export type PluginVersion = z.infer<typeof PluginVersionSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type PluginUserConfigInstance = z.infer<
  typeof PluginUserConfigInstanceSchema
>;
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;
export type PluginComponent = z.infer<typeof PluginComponentSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
