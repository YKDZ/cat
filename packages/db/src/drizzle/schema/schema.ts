import {
  pgEnum,
  pgTable,
  uuid,
  serial,
  text,
  integer,
  jsonb,
  vector as dbVector,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
  unique,
  check,
  bytea,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import {
  PluginServiceTypeValues,
  ResourceTypeValues,
  ScopeTypeValues,
  TaskStatusValues,
  TranslatableElementCommentReactionTypeValues,
  TranslatableElementContextTypeValues,
} from "@cat/shared/schema/drizzle/enum";
import type {
  _JSONSchema,
  JSONType,
  NonNullJSONType,
} from "@cat/shared/schema/json";

export const taskStatus = pgEnum("TaskStatus", TaskStatusValues);

export const pluginServiceType = pgEnum(
  "PluginServiceType",
  PluginServiceTypeValues,
);

export const scopeType = pgEnum("ScopeType", ScopeTypeValues);

export const translatableElementContextType = pgEnum(
  "TranslatableElementContextType",
  TranslatableElementContextTypeValues,
);

export const translatableElementCommentReactionType = pgEnum(
  "TranslatableElementCommentReactionType",
  TranslatableElementCommentReactionTypeValues,
);

export const resourceType = pgEnum("ResourceType", ResourceTypeValues);

export const account = pgTable(
  "Account",
  {
    type: text().notNull(),
    provider: text().notNull(),
    providedAccountId: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    meta: jsonb().$type<JSONType>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.provider, table.providedAccountId],
    }),
    uniqueIndex().using(
      "btree",
      table.userId.asc().nullsLast(),
      table.provider.asc().nullsLast(),
    ),
  ],
);

export const blob = pgTable(
  "Blob",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    storageProviderId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    referenceCount: integer().default(1).notNull(),
    hash: bytea(),
  },
  (table) => [
    unique().on(table.hash),
    unique().on(table.storageProviderId, table.key),
    check("hash_check", sql`CHECK ((octet_length(hash) = 32))`),
    check("referenceCount_check", sql`CHECK ((reference_count >= 0))`),
  ],
);

export const chunk = pgTable(
  "Chunk",
  {
    id: serial().primaryKey(),
    meta: jsonb().$type<JSONType>(),
    chunkSetId: integer()
      .notNull()
      .references(() => chunkSet.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    vectorizerId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    vectorStorageId: integer().notNull(),
  },
  (table) => [index().using("btree", table.chunkSetId.asc().nullsLast())],
);

export const chunkSet = pgTable("ChunkSet", {
  id: serial().primaryKey(),
  meta: jsonb().$type<JSONType>(),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const document = pgTable(
  "Document",
  {
    id: uuid().default("uuidv7()").primaryKey(),
    name: text(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    creatorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    fileHandlerId: integer().references(() => pluginService.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    fileId: integer().references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    isDirectory: boolean().default(false).notNull(),
  },
  (table) => [index().using("btree", table.projectId.asc().nullsLast())],
);

export const documentClosure = pgTable(
  "DocumentClosure",
  {
    ancestor: uuid()
      .notNull()
      .references(() => document.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    descendant: uuid()
      .notNull()
      .references(() => document.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    depth: integer().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.ancestor, table.descendant],
    }),
    index().using("btree", table.ancestor.asc().nullsLast()),
    index().using("btree", table.descendant.asc().nullsLast()),
  ],
);

export const documentToTask = pgTable(
  "DocumentToTask",
  {
    documentId: uuid()
      .notNull()
      .references(() => document.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    taskId: uuid()
      .notNull()
      .references(() => task.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [
    primaryKey({
      columns: [table.documentId, table.taskId],
    }),
    index().using("btree", table.taskId.asc().nullsLast()),
  ],
);

export const documentVersion = pgTable("DocumentVersion", {
  id: serial().primaryKey(),
  documentId: uuid()
    .notNull()
    .references(() => document.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  isActive: boolean().default(false).notNull(),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const file = pgTable("File", {
  id: serial().primaryKey(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  blobId: integer()
    .notNull()
    .references(() => blob.id, { onDelete: "restrict", onUpdate: "cascade" }),
  isActive: boolean().default(true).notNull(),
});

export const glossary = pgTable("Glossary", {
  id: uuid().default("uuidv7()").primaryKey(),
  name: text().notNull(),
  description: text(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const glossaryToProject = pgTable(
  "GlossaryToProject",
  {
    glossaryId: uuid()
      .notNull()
      .references(() => glossary.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.glossaryId, table.projectId],
    }),
    index().using("btree", table.projectId.asc().nullsLast()),
  ],
);

export const language = pgTable("Language", {
  id: text().primaryKey(),
});

export const memory = pgTable("Memory", {
  id: uuid().default("uuidv7()").primaryKey(),
  name: text().notNull(),
  description: text(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const memoryItem = pgTable("MemoryItem", {
  id: serial().primaryKey(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  memoryId: uuid()
    .notNull()
    .references(() => memory.id, { onDelete: "cascade", onUpdate: "cascade" }),
  sourceElementId: integer().references(() => translatableElement.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  translationId: integer().references(() => translation.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  sourceStringId: integer()
    .notNull()
    .references(() => translatableString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  translationStringId: integer()
    .notNull()
    .references(() => translatableString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
});

export const memoryToProject = pgTable(
  "MemoryToProject",
  {
    memoryId: uuid()
      .notNull()
      .references(() => memory.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.memoryId, table.projectId],
    }),
    index().using("btree", table.projectId.asc().nullsLast()),
  ],
);

export const permission = pgTable("Permission", {
  id: serial().primaryKey(),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  templateId: integer()
    .notNull()
    .references(() => permissionTemplate.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  resourceId: text(),
});

export const permissionTemplate = pgTable(
  "PermissionTemplate",
  {
    id: serial().primaryKey(),
    content: text().notNull(),
    resourceType: resourceType().notNull(),
    meta: jsonb().$type<JSONType>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [unique().on(table.content, table.resourceType)],
);

export const plugin = pgTable("Plugin", {
  id: text().primaryKey(),
  name: text().notNull(),
  overview: text(),
  isExternal: boolean().default(false).notNull(),
  entry: text().notNull(),
  iconUrl: text(),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  version: text().notNull(),
});

export const pluginConfig = pgTable(
  "PluginConfig",
  {
    id: serial().primaryKey(),
    pluginId: text()
      .notNull()
      .references(() => plugin.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    schema: jsonb().notNull().$type<_JSONSchema>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [uniqueIndex().using("btree", table.pluginId.asc().nullsLast())],
);

export const pluginConfigInstance = pgTable(
  "PluginConfigInstance",
  {
    id: serial().primaryKey(),
    value: jsonb().notNull().$type<NonNullJSONType>(),
    creatorId: uuid().references(() => user.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    configId: integer()
      .notNull()
      .references(() => pluginConfig.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    pluginInstallationId: integer()
      .notNull()
      .references(() => pluginInstallation.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.pluginInstallationId.asc().nullsLast(),
      table.configId.asc().nullsLast(),
    ),
  ],
);

export const pluginInstallation = pgTable(
  "PluginInstallation",
  {
    id: serial().primaryKey(),
    scopeId: text().notNull(),
    pluginId: text()
      .notNull()
      .references(() => plugin.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    scopeMeta: jsonb().$type<JSONType>(),
    scopeType: scopeType().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.scopeType.asc().nullsLast(),
      table.scopeId.asc().nullsLast(),
      table.pluginId.asc().nullsLast(),
    ),
  ],
);

export const pluginService = pgTable(
  "PluginService",
  {
    id: serial().primaryKey(),
    serviceId: text().notNull(),
    pluginInstallationId: integer()
      .notNull()
      .references(() => pluginInstallation.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    serviceType: pluginServiceType().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.serviceType.asc().nullsLast(),
      table.serviceId.asc().nullsLast(),
      table.pluginInstallationId.asc().nullsLast(),
    ),
  ],
);

export const project = pgTable(
  "Project",
  {
    id: uuid().default("uuidv7()").primaryKey(),
    name: text().notNull(),
    description: text(),
    creatorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [index().using("btree", table.creatorId.asc().nullsLast())],
);

export const projectTargetLanguage = pgTable(
  "ProjectTargetLanguage",
  {
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    projectId: uuid()
      .notNull()
      .references(() => project.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    primaryKey({
      columns: [table.languageId, table.projectId],
    }),
    index().using("btree", table.projectId.asc().nullsLast()),
  ],
);

export const role = pgTable(
  "Role",
  {
    id: serial().primaryKey(),
    scopeType: scopeType().notNull(),
    scopeId: text().notNull(),
    name: text().notNull(),
    creatorId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [unique().on(table.name, table.scopeType, table.scopeId)],
);

export const rolePermission = pgTable(
  "RolePermission",
  {
    roleId: integer()
      .notNull()
      .references(() => role.id, { onDelete: "cascade", onUpdate: "cascade" }),
    permissionId: integer()
      .notNull()
      .references(() => permission.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    isAllowed: boolean().default(true).notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.roleId, table.permissionId],
    }),
  ],
);

export const setting = pgTable(
  "Setting",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    value: jsonb().notNull().$type<NonNullJSONType>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [uniqueIndex().using("btree", table.key.asc().nullsLast())],
);

export const task = pgTable(
  "Task",
  {
    id: uuid().default("uuidv7()").primaryKey(),
    status: taskStatus().default("PENDING").notNull(),
    type: text().notNull(),
    meta: jsonb().$type<JSONType>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [index().using("btree", table.meta.asc().nullsLast())],
);

export const term = pgTable("Term", {
  id: serial().primaryKey(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  glossaryId: uuid()
    .notNull()
    .references(() => glossary.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  stringId: integer()
    .notNull()
    .references(() => translatableString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
});

export const termRelation = pgTable(
  "TermRelation",
  {
    id: serial().primaryKey(),
    termId: integer()
      .notNull()
      .references(() => term.id, { onDelete: "restrict", onUpdate: "cascade" }),
    translationId: integer()
      .notNull()
      .references(() => term.id, { onDelete: "restrict", onUpdate: "cascade" }),
  },
  (table) => [index().using("btree", table.translationId.asc().nullsLast())],
);

export const translatableElement = pgTable("TranslatableElement", {
  id: serial().primaryKey(),
  meta: jsonb().$type<JSONType>(),
  documentId: uuid()
    .notNull()
    .references(() => document.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  documentVersionId: integer().references(() => documentVersion.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  sortIndex: integer().notNull(),
  creatorId: uuid().references(() => user.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  translatableStringId: integer()
    .notNull()
    .references(() => translatableString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
});

export const translatableElementComment = pgTable(
  "TranslatableElementComment",
  {
    id: serial().primaryKey(),
    translatableElementId: integer()
      .notNull()
      .references(() => translatableElement.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    content: text().notNull(),
    parentCommentId: integer(),
    rootCommentId: integer(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    foreignKey({
      columns: [table.parentCommentId],
      foreignColumns: [table.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.rootCommentId],
      foreignColumns: [table.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    index().using("btree", table.parentCommentId.asc().nullsLast()),
    index().using("btree", table.rootCommentId.asc().nullsLast()),
    index().using("btree", table.translatableElementId.asc().nullsLast()),
    index().using("btree", table.userId.asc().nullsLast()),
  ],
);

export const translatableElementCommentReaction = pgTable(
  "TranslatableElementCommentReaction",
  {
    id: serial().primaryKey(),
    translatableElementCommentId: integer()
      .notNull()
      .references(() => translatableElementComment.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    type: translatableElementCommentReactionType().notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index().using(
      "btree",
      table.translatableElementCommentId.asc().nullsLast(),
    ),
    index().using("btree", table.userId.asc().nullsLast()),
    unique().on(table.translatableElementCommentId, table.userId),
  ],
);

export const translatableElementContext = pgTable(
  "TranslatableElementContext",
  {
    id: serial().primaryKey(),
    type: translatableElementContextType().notNull(),
    jsonData: jsonb().$type<JSONType>(),
    fileId: integer().references(() => file.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    storageProviderId: integer().references(() => pluginService.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    textData: text(),
    translatableElementId: integer()
      .notNull()
      .references(() => translatableElement.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index().using("btree", table.translatableElementId.asc().nullsLast()),
  ],
);

export const translatableString = pgTable(
  "TranslatableString",
  {
    id: serial().primaryKey(),
    value: text().notNull(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    chunkSetId: integer()
      .notNull()
      .references(() => chunkSet.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [unique().on(table.languageId, table.value)],
);

export const translation = pgTable(
  "Translation",
  {
    id: serial().primaryKey(),
    translatorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    translatableElementId: integer()
      .notNull()
      .references(() => translatableElement.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    meta: jsonb().$type<JSONType>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    stringId: integer()
      .notNull()
      .references(() => translatableString.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.translatorId.asc().nullsLast(),
      table.translatableElementId.asc().nullsLast(),
      table.stringId.asc().nullsLast(),
    ),
  ],
);

export const translationApprovement = pgTable("TranslationApprovement", {
  id: serial().primaryKey(),
  isActive: boolean().default(false).notNull(),
  translationId: integer()
    .notNull()
    .references(() => translation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  createdAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .default(sql`now()`)
    .notNull(),
});

export const translationVote = pgTable(
  "TranslationVote",
  {
    id: serial().primaryKey(),
    value: integer().default(0).notNull(),
    voterId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    translationId: integer()
      .notNull()
      .references(() => translation.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    index().using("btree", table.translationId.asc().nullsLast()),
    index().using("btree", table.voterId.asc().nullsLast()),
    uniqueIndex().using(
      "btree",
      table.voterId.asc().nullsLast(),
      table.translationId.asc().nullsLast(),
    ),
  ],
);

export const user = pgTable(
  "User",
  {
    id: uuid().default("uuidv7()").primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    avatarFileId: integer().references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
  },
  (table) => [unique().on(table.email, table.name)],
);

export const userRole = pgTable(
  "UserRole",
  {
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    roleId: integer()
      .notNull()
      .references(() => role.id, { onDelete: "cascade", onUpdate: "cascade" }),
    meta: jsonb().$type<JSONType>(),
    createdAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
    updatedAt: timestamp({ withTimezone: true })
      .default(sql`now()`)
      .notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.userId, table.roleId],
    }),
  ],
);

export const vector = pgTable(
  "Vector",
  {
    id: serial().primaryKey(),
    vector: dbVector({ dimensions: 1024 }).notNull(),
    chunkId: integer()
      .notNull()
      .references(() => chunk.id, { onDelete: "cascade", onUpdate: "cascade" }),
  },
  (table) => [index().using("hnsw", table.vector.asc().nullsLast().op("hnsw"))],
);
