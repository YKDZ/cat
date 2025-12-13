import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";
import { ResourceTypeSchema, ScopeTypeSchema } from "@/schema/drizzle/enum";
import { safeZDotJson } from "@/schema/json";

export const RoleSchema = z.object({
  id: z.int(),
  name: z.string(),
  creatorId: z.uuidv7().nullable(),
  scopeType: ScopeTypeSchema,
  scopeId: z.string(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const PermissionSchema = z.object({
  id: z.int(),
  templateId: z.int(),
  resourceId: z.string(),
});

export const PermissionTemplateSchema = z.object({
  id: z.int(),
  content: z.string(),
  meta: safeZDotJson,
  resourceType: ResourceTypeSchema,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const RolePermissionSchema = z.object({
  roleId: z.int(),
  permissionId: z.int(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});

export const UserRoleSchema = z.object({
  userId: z.uuidv7(),
  roleId: z.int(),
  meta: safeZDotJson,
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
});
