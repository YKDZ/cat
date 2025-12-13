import { ResourceTypeValues } from "@cat/shared/schema/drizzle/enum";
import { timestamps } from "./reuse";
import { user } from "./user";
import { relations } from "drizzle-orm";
import {
  pgTable,
  serial,
  text,
  uuid,
  foreignKey,
  jsonb,
  integer,
  primaryKey,
  pgEnum,
  boolean,
  unique,
} from "drizzle-orm/pg-core";
import { scopeType } from "./plugin";

export const resourceType = pgEnum("ResourceType", ResourceTypeValues);

export const role = pgTable(
  "Role",
  {
    id: serial().primaryKey(),
    scopeType: scopeType().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    creatorId: uuid(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.name, table.scopeType, table.scopeId),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const permissionTemplate = pgTable(
  "PermissionTemplate",
  {
    id: serial().primaryKey(),
    content: text().notNull(),
    resourceType: resourceType().notNull(),
    meta: jsonb(),
    ...timestamps,
  },
  (table) => [unique().on(table.content, table.resourceType)],
);

export const permission = pgTable(
  "Permission",
  {
    id: serial().primaryKey(),
    resourceId: text(),
    templateId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.templateId],
      foreignColumns: [permissionTemplate.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const rolePermission = pgTable(
  "RolePermission",
  {
    roleId: integer().notNull(),
    permissionId: integer().notNull(),
    isAllowed: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [role.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.permissionId],
      foreignColumns: [permission.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const userRole = pgTable(
  "UserRole",
  {
    userId: uuid().notNull(),
    roleId: integer().notNull(),
    meta: jsonb(),
    ...timestamps,
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.roleId],
    }),
    foreignKey({
      columns: [table.roleId],
      foreignColumns: [role.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const roleRelations = relations(role, ({ one, many }) => ({
  Creator: one(user, {
    fields: [role.creatorId],
    references: [user.id],
  }),
  RolePermissions: many(rolePermission),
  UserRoles: many(userRole),
}));

export const permissionTemplateRelations = relations(
  permissionTemplate,
  ({ many }) => ({
    Permissions: many(permission),
  }),
);

export const permissionRelations = relations(permission, ({ one, many }) => ({
  PermissionTemplate: one(permissionTemplate, {
    fields: [permission.templateId],
    references: [permissionTemplate.id],
  }),
  RolePermissions: many(rolePermission),
}));

export const rolePermissionRelations = relations(rolePermission, ({ one }) => ({
  Role: one(role, {
    fields: [rolePermission.roleId],
    references: [role.id],
  }),
  Permission: one(permission, {
    fields: [rolePermission.permissionId],
    references: [permission.id],
  }),
}));

export const userRoleRelations = relations(userRole, ({ one }) => ({
  User: one(user, {
    fields: [userRole.userId],
    references: [user.id],
  }),
  Role: one(role, {
    fields: [userRole.roleId],
    references: [role.id],
  }),
}));
