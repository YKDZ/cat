import z from "zod";
import { PrimsaDateTime } from "../misc";

export const RoleSchema = z.object({
  id: z.int(),
  name: z.string(),
  description: z.string().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

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
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

  get RolePermissions() {
    return z.array(RolePermissionSchema).optional();
  },
});

export const RolePermissionSchema = z.object({
  id: z.int(),
  isAllowed: z.boolean(),
  conditions: z.any().nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

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
  expiresAt: PrimsaDateTime.nullable(),
  createdAt: PrimsaDateTime,
  updatedAt: PrimsaDateTime,

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
