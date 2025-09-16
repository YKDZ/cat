import z from "zod";
import { PrismaDateTime } from "@/schema/misc.ts";

export const RoleSchema = z.object({
  id: z.int(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  parentId: z.int().nullable(),
  get Parent() {
    return RoleSchema.optional();
  },

  get Childrens() {
    return z.array(RoleSchema).optional();
  },

  get UserRoles() {
    return z.array(UserRoleSchema).optional();
  },

  get RolePermissions() {
    return z.array(RolePermissionSchema).optional();
  },
});

export const PermissionSchema = z.object({
  id: z.int(),
  resource: z.string(),
  action: z.string(),
  description: z.string().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  get RolePermissions() {
    return z.array(RolePermissionSchema).optional();
  },
});

export const RolePermissionSchema = z.object({
  id: z.int(),
  isAllowed: z.boolean(),
  conditions: z.any().nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

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
  expiresAt: PrismaDateTime.nullable(),
  createdAt: PrismaDateTime,
  updatedAt: PrismaDateTime,

  userId: z.ulid(),
  get User() {
    return z
      .object({
        id: z.ulid(),
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
