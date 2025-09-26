import * as z from "zod/v4";
import { PrismaDateTime } from "@/schema/misc.ts";
import { JSONSchemaSchema, safeZDotJson } from "@/schema/json.ts";

export const PluginInstallationSchema = z.object({
  id: z.int(),
  scopeType: z.enum(["GLOBAL", "PROJECT", "USER"]),
  scopeId: z.string().nullable(),
  scopeMeta: safeZDotJson.nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  pluginId: z.string(),
});

export const PluginTagSchema = z.object({
  id: z.int(),
  name: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
});

export const PluginConfigSchema = z.object({
  id: z.int(),
  schema: JSONSchemaSchema,
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  pluginId: z.string(),
});

export const PluginConfigInstanceSchema = z.object({
  id: z.int(),
  value: safeZDotJson,
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  configId: z.int(),

  creatorId: z.string().nullable(),

  pluginInstallationId: z.int().nullable(),
});

export const PluginPermissionSchema = z.object({
  id: z.int(),
  permission: z.string(),
  description: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
  pluginId: z.string(),
});

export const PluginVersionSchema = z.object({
  id: z.int(),
  version: z.string(),
  pluginId: z.string(),
});

export const PluginSchema = z.object({
  id: z.string(),
  name: z.string(),
  overview: z.string().nullable(),
  iconUrl: z.url().nullable(),
  isExternal: z.boolean(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,
});

export const PluginServiceSchema = z.object({
  id: z.int(),
  serviceType: z.enum([
    "TRANSLATION_ADVISOR",
    "STORAGE_PROVIDER",
    "AUTH_PROVIDER",
    "TERM_SERVICE",
    "TRANSLATABLE_FILE_HANDLER",
    "TEXT_VECTORIZER",
  ]),
  serviceId: z.string(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  pluginInstallationId: z.int(),
});

export type PluginTag = z.infer<typeof PluginTagSchema>;
export type PluginVersion = z.infer<typeof PluginVersionSchema>;
export type PluginConfig = z.infer<typeof PluginConfigSchema>;
export type PluginConfigInstance = z.infer<typeof PluginConfigInstanceSchema>;
export type PluginPermission = z.infer<typeof PluginPermissionSchema>;
export type PluginInstallation = z.infer<typeof PluginInstallationSchema>;
export type Plugin = z.infer<typeof PluginSchema>;
export type PluginService = z.infer<typeof PluginServiceSchema>;
