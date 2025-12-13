import {
  boolean,
  foreignKey,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { _JSONSchema, JSONType } from "@cat/shared/schema/json";
import { relations } from "drizzle-orm";
import { timestamps } from "./reuse.ts";
import { user } from "./user.ts";
import { blob } from "./file.ts";
import { document, translatableElementContext } from "./document.ts";
import { chunk } from "./vector.ts";
import {
  PluginServiceTypeValues,
  ScopeTypeValues,
} from "@cat/shared/schema/drizzle/enum";

export const pluginServiceType = pgEnum(
  "PluginServiceType",
  PluginServiceTypeValues,
);

/**
 * 代表对象生效的作用域
 * 对 plugin 是其安装的位置
 * 对 role 是其所属的作用域
 */
export const scopeType = pgEnum("ScopeType", ScopeTypeValues);

export const plugin = pgTable("Plugin", {
  id: text().primaryKey().notNull(),
  version: text().notNull(),
  name: text().notNull(),
  overview: text(),
  isExternal: boolean().default(false).notNull(),
  entry: text().notNull(),
  iconUrl: text(),
  ...timestamps,
});

export const pluginConfig = pgTable(
  "PluginConfig",
  {
    id: serial().primaryKey().notNull(),
    pluginId: text().notNull(),
    schema: jsonb().notNull().$type<_JSONSchema>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.pluginId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.pluginId],
      foreignColumns: [plugin.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const pluginService = pgTable(
  "PluginService",
  {
    id: serial().primaryKey().notNull(),
    serviceId: text().notNull(),
    pluginInstallationId: integer().notNull(),
    serviceType: pluginServiceType().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.serviceType.asc().nullsLast().op("enum_ops"),
      table.serviceId.asc().nullsLast().op("text_ops"),
      table.pluginInstallationId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.pluginInstallationId],
      foreignColumns: [pluginInstallation.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const pluginConfigInstance = pgTable(
  "PluginConfigInstance",
  {
    id: serial().primaryKey().notNull(),
    value: jsonb().notNull().$type<Exclude<JSONType, null>>(),
    creatorId: uuid(),
    configId: integer().notNull(),
    pluginInstallationId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.pluginInstallationId.asc().nullsLast().op("int4_ops"),
      table.configId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.configId],
      foreignColumns: [pluginConfig.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.pluginInstallationId],
      foreignColumns: [pluginInstallation.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const pluginInstallation = pgTable(
  "PluginInstallation",
  {
    id: serial().primaryKey().notNull(),
    scopeType: scopeType().notNull(),
    scopeId: text().notNull(),
    pluginId: text().notNull(),
    scopeMeta: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.scopeType.asc().nullsLast().op("enum_ops"),
      table.scopeId.asc().nullsLast().op("text_ops"),
      table.pluginId.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.pluginId],
      foreignColumns: [plugin.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const pluginServiceRelations = relations(
  pluginService,
  ({ one, many }) => ({
    PluginInstallation: one(pluginInstallation, {
      fields: [pluginService.pluginInstallationId],
      references: [pluginInstallation.id],
    }),

    Blobs: many(blob),
    Documents: many(document),
    VectorizerChunks: many(chunk, {
      relationName: "chunkVectorizerService",
    }),
    VectorStorageChunks: many(chunk, {
      relationName: "chunkVectorStorageService",
    }),
    TranslatableElementContexts: many(translatableElementContext),
  }),
);

export const pluginInstallationRelations = relations(
  pluginInstallation,
  ({ one, many }) => ({
    Plugin: one(plugin, {
      fields: [pluginInstallation.pluginId],
      references: [plugin.id],
    }),

    PluginServices: many(pluginService),
    PluginConfigInstances: many(pluginConfigInstance),
  }),
);

export const pluginRelations = relations(plugin, ({ one, many }) => ({
  PluginConfig: one(pluginConfig),
  PluginInstallations: many(pluginInstallation),
}));

export const pluginConfigRelations = relations(
  pluginConfig,
  ({ one, many }) => ({
    Plugin: one(plugin, {
      fields: [pluginConfig.pluginId],
      references: [plugin.id],
    }),
    PluginConfigInstances: many(pluginConfigInstance),
  }),
);

export const pluginConfigInstanceRelations = relations(
  pluginConfigInstance,
  ({ one }) => ({
    Creator: one(user, {
      fields: [pluginConfigInstance.creatorId],
      references: [user.id],
    }),
    PluginConfig: one(pluginConfig, {
      fields: [pluginConfigInstance.configId],
      references: [pluginConfig.id],
    }),
    PluginInstallation: one(pluginInstallation, {
      fields: [pluginConfigInstance.pluginInstallationId],
      references: [pluginInstallation.id],
    }),
  }),
);
