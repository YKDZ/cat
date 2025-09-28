import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { JSONSchema } from "@cat/shared/schema/json";
import { relations } from "drizzle-orm";
import { timestamps } from "./reuse.ts";
import { user } from "./user.ts";
import { file } from "./file.ts";
import { document } from "./document.ts";
import { vector } from "./vector.ts";

export type PluginServiceType =
  | "AUTH_PROVIDER"
  | "STORAGE_PROVIDER"
  | "TERM_SERVICE"
  | "TRANSLATABLE_FILE_HANDLER"
  | "TRANSLATION_ADVISOR"
  | "TEXT_VECTORIZER";

export const pluginServiceType = pgEnum("PluginServiceType", [
  "TRANSLATION_ADVISOR",
  "STORAGE_PROVIDER",
  "AUTH_PROVIDER",
  "TERM_SERVICE",
  "TRANSLATABLE_FILE_HANDLER",
  "TEXT_VECTORIZER",
]);

export type ScopeType = "GLOBAL" | "PROJECT" | "USER";

export const scopeType = pgEnum("ScopeType", ["GLOBAL", "USER", "PROJECT"]);

export const plugin = pgTable("Plugin", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
  overview: text(),
  isExternal: boolean().default(false).notNull(),
  entry: text().notNull(),
  iconUrl: text(),
  ...timestamps,
});

export const pluginTag = pgTable(
  "PluginTag",
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using("btree", table.name.asc().nullsLast().op("text_ops")),
  ],
);

export const pluginConfig = pgTable(
  "PluginConfig",
  {
    id: serial().primaryKey().notNull(),
    pluginId: text().notNull(),
    schema: jsonb().notNull().$type<JSONSchema>(),
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
    value: jsonb().notNull(),
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
    scopeId: text().notNull(),
    pluginId: text().notNull(),
    scopeMeta: jsonb(),
    scopeType: scopeType().notNull(),
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

export const pluginToPluginTag = pgTable(
  "PluginToPluginTag",
  {
    pluginId: text().notNull(),
    pluginTagId: integer().notNull(),
  },
  (table) => [
    index().using("btree", table.pluginTagId.asc().nullsLast().op("int4_ops")),
    foreignKey({
      columns: [table.pluginId],
      foreignColumns: [plugin.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.pluginTagId],
      foreignColumns: [pluginTag.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    primaryKey({
      columns: [table.pluginId, table.pluginTagId],
    }),
  ],
);

export const pluginServiceRelations = relations(
  pluginService,
  ({ one, many }) => ({
    PluginInstallation: one(pluginInstallation, {
      fields: [pluginService.pluginInstallationId],
      references: [pluginInstallation.id],
    }),
    Files: many(file),
    Documents: many(document),
    Vectors: many(vector),
  }),
);

export const pluginInstallationRelations = relations(
  pluginInstallation,
  ({ one, many }) => ({
    pluginServices: many(pluginService),
    pluginConfigInstances: many(pluginConfigInstance),
    plugin: one(plugin, {
      fields: [pluginInstallation.pluginId],
      references: [plugin.id],
    }),
  }),
);

export const pluginRelations = relations(plugin, ({ one, many }) => ({
  PluginConfig: one(pluginConfig),
  PluginInstallations: many(pluginInstallation),
  PluginToPluginTags: many(pluginToPluginTag),
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

export const PluginConfigInstanceRelations = relations(
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

export const pluginToPluginTagRelations = relations(
  pluginToPluginTag,
  ({ one }) => ({
    Plugin: one(plugin, {
      fields: [pluginToPluginTag.pluginId],
      references: [plugin.id],
    }),
    PluginTag: one(pluginTag, {
      fields: [pluginToPluginTag.pluginTagId],
      references: [pluginTag.id],
    }),
  }),
);

export const pluginTagRelations = relations(pluginTag, ({ many }) => ({
  PluginToPluginTags: many(pluginToPluginTag),
}));
