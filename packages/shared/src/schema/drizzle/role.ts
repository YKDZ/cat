import * as z from "zod/v4";
import { DrizzleDateTimeSchema } from "@/schema/misc.ts";

export const RoleSchema = z.object({
  id: z.int(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,
  parentId: z.int().nullable(),
});

export const PermissionSchema = z.object({
  id: z.int(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,

  get RolePermissions() {
    return z.array(RolePermissionSchema).optional();
  },
});

export const RolePermissionSchema = z.object({
  id: z.int(),
  isAllowed: z.boolean(),
  conditions: z.any().nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,

  roleId: z.int(),
  get Role() {
    return RoleSchema.optional();
  },

  permissionId: z.int(),
  get Permission() {
    return PermissionSchema.optional();
  },
});

export const UserRoleSchema = z.object({
  id: z.int(),
  scope: z.any().nullable(),
  isEnabled: z.boolean(),
  expiresAt: DrizzleDateTimeSchema.nullable(),
  createdAt: DrizzleDateTimeSchema,
  updatedAt: DrizzleDateTimeSchema,

  userId: z.uuidv7(),
  get User() {
    return z
      .object({
        id: z.uuidv7(),
        name: z.string(),
        email: z.string().email(),
      })
      .optional();
  },

  roleId: z.int(),
  get Role() {
    return RoleSchema.optional();
  },
});
