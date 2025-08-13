import z from "zod";
import { PrimsaDateTime } from "../misc";
import type { JSONSchema } from "zod/v4/core";
import { UserSchema } from "./user";

export const PluginTagSchema = z.object({
  id: z.int(),
  name: z.string(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
});

export const PluginConfigSchema = z.object({
  id: z.int(),
  key: z.string(),
  overridable: z.boolean().default(false),
  schema: z.custom<JSONSchema.JSONSchema>(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,
  pluginId: z.string(),

  get Instances() {
    return z.array(PluginConfigInstanceSchema).optional();
  },
});

export const PluginConfigInstanceSchema = z.object({
  id: z.int(),
  value: z.json(),
  scopeType: z.enum(["GLOBAL", "PROJECT", "USER"]),
  scopeId: z.string().nullable(),
  scopeMeta: z.json().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

  configId: z.int(),
  get Config() {
    return PluginConfigSchema;
  },

  creatorId: z.string().nullable(),
  get Creator() {
    return UserSchema.optional().nullable();
  },
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

  get components() {
    return z.array(PluginTagSchema).optional();
  },
});

export type PluginTag = z.infer<typeof PluginTagSchema>;
export type PluginVersion = z.infer<typeof PluginVersionSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type PluginConfigInstance = z.infer<typeof PluginConfigInstanceSchema>;
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;
export type PluginComponent = z.infer<typeof PluginComponentSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
