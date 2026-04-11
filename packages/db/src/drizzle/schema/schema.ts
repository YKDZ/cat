import type {
  AgentLLMConfig,
  AgentPromptConfig,
  AgentConstraints,
  AgentSecurityPolicy,
  Orchestration,
} from "@cat/shared/schema/agent";
import type {
  _JSONSchema,
  JSONType,
  NonNullJSONType,
} from "@cat/shared/schema/json";

import {
  PluginServiceTypeValues,
  ResourceTypeValues,
  ScopeTypeValues,
  TaskStatusValues,
  CommentReactionTypeValues,
  TranslatableElementContextTypeValues,
  CommentTargetTypeValues,
  TermTypeValues,
  TermStatusValues,
  AgentSessionStatusValues,
  AgentToolTargetValues,
  AgentToolConfirmationStatusValues,
  AgentSessionTrustPolicyValues,
  AgentDefinitionTypeValues,
  ObjectTypeValues,
  SubjectTypeValues,
  RelationValues,
  PermissionActionValues,
  MessageChannelValues,
  MessageCategoryValues,
  NotificationStatusValues,
  KanbanCardStatusValues,
  type NotificationStatus,
  ChangesetStatusValues,
  EntityTypeValues,
  ChangeActionValues,
  RiskLevelValues,
  ReviewStatusValues,
  AsyncStatusValues,
  ChangesetEntryAsyncStatusValues,
} from "@cat/shared/schema/enum";
import { sql } from "drizzle-orm";
import {
  pgEnum,
  pgTable,
  uuid,
  serial,
  text,
  integer,
  jsonb,
  boolean,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
  unique,
  check,
  bytea,
  type PgColumn,
} from "drizzle-orm/pg-core";

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

export const commentReactionType = pgEnum(
  "CommentReactionType",
  CommentReactionTypeValues,
);

export const resourceType = pgEnum("ResourceType", ResourceTypeValues);

export const commentTargetType = pgEnum(
  "CommentTargetType",
  CommentTargetTypeValues,
);

export const termType = pgEnum("TermType", TermTypeValues);

export const termStatus = pgEnum("TermStatus", TermStatusValues);

export const objectType = pgEnum("ObjectType", ObjectTypeValues);
export const subjectType = pgEnum("SubjectType", SubjectTypeValues);
export const relation = pgEnum("Relation", RelationValues);
export const permissionAction = pgEnum(
  "PermissionAction",
  PermissionActionValues,
);

export const messageChannel = pgEnum("MessageChannel", MessageChannelValues);
export const messageCategory = pgEnum("MessageCategory", MessageCategoryValues);
export const notificationStatus = pgEnum(
  "NotificationStatus",
  NotificationStatusValues,
);

export const changesetStatus = pgEnum("ChangeSetStatus", ChangesetStatusValues);
export const entityType = pgEnum("EntityType", EntityTypeValues);
export const changeAction = pgEnum("ChangeAction", ChangeActionValues);
export const riskLevel = pgEnum("RiskLevel", RiskLevelValues);
export const reviewStatus = pgEnum("ReviewStatus", ReviewStatusValues);
export const asyncStatus = pgEnum("AsyncStatus", AsyncStatusValues);
export const changesetEntryAsyncStatus = pgEnum(
  "ChangesetEntryAsyncStatus",
  ChangesetEntryAsyncStatusValues,
);

const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
};

export const account = pgTable(
  "Account",
  {
    id: serial().primaryKey(),
    providerIssuer: text().notNull(),
    providedAccountId: text().notNull(),
    meta: jsonb().$type<JSONType>(),

    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    authProviderId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    ...timestamps,
  },
  (table) => [unique().on(table.providerIssuer, table.providedAccountId)],
);

export const mfaProvider = pgTable("MFAProvider", {
  id: serial().primaryKey(),
  failureCount: integer().notNull().default(0),
  lastUsedAt: timestamp({ withTimezone: true }),
  payload: jsonb().notNull().$type<NonNullJSONType>(),
  userId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  mfaServiceId: integer()
    .notNull()
    .references(() => pluginService.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),

  ...timestamps,
});

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
    referenceCount: integer().default(1).notNull(),
    hash: bytea(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    unique().on(table.hash),
    unique().on(table.storageProviderId, table.key),
    check("hash_check", sql`octet_length(${table.hash}) = 32`),
    check("referenceCount_check", sql`${table.referenceCount} >= 0`),
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
    vectorizerId: integer()
      .notNull()
      .references(() => pluginService.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    vectorStorageId: integer().notNull(),
    ...timestamps,
  },
  (table) => [index().using("btree", table.chunkSetId.asc().nullsLast())],
);

export const chunkSet = pgTable("ChunkSet", {
  id: serial().primaryKey(),
  meta: jsonb().$type<JSONType>(),
  ...timestamps,
});

export const document = pgTable(
  "Document",
  {
    id: uuid().defaultRandom().primaryKey(),
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
    fileId: integer().references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    isDirectory: boolean().default(false).notNull(),
    ...timestamps,
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

export const file = pgTable("File", {
  id: serial().primaryKey(),
  name: text().notNull(),
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  blobId: integer()
    .notNull()
    .references(() => blob.id, { onDelete: "restrict", onUpdate: "cascade" }),
  isActive: boolean().default(true).notNull(),
});

export const glossary = pgTable("Glossary", {
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  description: text(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
  ...timestamps,
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
  id: uuid().defaultRandom().primaryKey(),
  name: text().notNull(),
  description: text(),
  creatorId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
  ...timestamps,
});

export const memoryItem = pgTable("MemoryItem", {
  id: serial().primaryKey(),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
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
  sourceStringId: integer()
    .notNull()
    .references(() => vectorizedString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  translationStringId: integer()
    .notNull()
    .references(() => vectorizedString.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  /** Placeholderized source text template, e.g. "Error Code: {NUM_0}" */
  sourceTemplate: text(),
  /** Placeholderized translation text template */
  translationTemplate: text(),
  /** JSON mapping of placeholder → original value + token type */
  slotMapping: jsonb().$type<JSONType>(),
  ...timestamps,
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

export const plugin = pgTable("Plugin", {
  id: text().primaryKey(),
  name: text().notNull(),
  overview: text(),
  isExternal: boolean().default(false).notNull(),
  entry: text().notNull(),
  iconUrl: text(),
  version: text().notNull(),
  ...timestamps,
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
    ...timestamps,
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
    ...timestamps,
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
    ...timestamps,
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
    ...timestamps,
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

export const pluginComponent = pgTable("PluginComponent", {
  id: serial().primaryKey(),
  componentId: text().notNull(),
  slot: text().notNull(),
  url: text().notNull(),
  pluginInstallationId: integer()
    .notNull()
    .references(() => pluginInstallation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const project = pgTable(
  "Project",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    description: text(),
    creatorId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "restrict", onUpdate: "cascade" }),
    ...timestamps,
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

export const setting = pgTable(
  "Setting",
  {
    id: serial().primaryKey(),
    key: text().notNull(),
    value: jsonb().notNull().$type<NonNullJSONType>(),
    ...timestamps,
  },
  (table) => [uniqueIndex().using("btree", table.key.asc().nullsLast())],
);

export const task = pgTable(
  "Task",
  {
    id: uuid().defaultRandom().primaryKey(),
    status: taskStatus().default("PENDING").notNull(),
    type: text().notNull(),
    meta: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [index().using("btree", table.meta.asc().nullsLast())],
);

export const term = pgTable(
  "Term",
  {
    id: serial().primaryKey(),
    type: termType().notNull().default("NOT_SPECIFIED"),
    status: termStatus().notNull().default("NOT_SPECIFIED"),
    creatorId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    text: text().notNull(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    termConceptId: integer()
      .notNull()
      .references(() => termConcept.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    unique().on(table.languageId, table.text, table.termConceptId),
    // pg_trgm GIN index for fast bidirectional ILIKE matching (term.lookup)
    index("idx_term_text_trgm").using("gin", sql`${table.text} gin_trgm_ops`),
  ],
);

export const termConcept = pgTable("TermConcept", {
  id: serial().primaryKey(),
  definition: text(),
  stringId: integer().references(() => vectorizedString.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  glossaryId: uuid()
    .notNull()
    .references(() => glossary.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const termConceptToSubject = pgTable(
  "TermConceptToSubject",
  {
    termConceptId: integer()
      .notNull()
      .references(() => termConcept.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    subjectId: integer()
      .notNull()
      .references(() => termConceptSubject.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    isPrimary: boolean().notNull().default(false),
  },
  (table) => [
    primaryKey({
      columns: [table.termConceptId, table.subjectId],
    }),
  ],
);

export const termConceptSubject = pgTable("TermConceptSubject", {
  id: serial().primaryKey(),
  subject: text().notNull(),
  defaultDefinition: text(),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  glossaryId: uuid().references(() => glossary.id, {
    onDelete: "cascade",
    onUpdate: "cascade",
  }),
  ...timestamps,
});

export const translatableElement = pgTable(
  "TranslatableElement",
  {
    id: serial().primaryKey(),
    meta: jsonb().$type<JSONType>(),
    documentId: uuid()
      .notNull()
      .references(() => document.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    sortIndex: integer(),
    sourceStartLine: integer(),
    sourceEndLine: integer(),
    sourceLocationMeta: jsonb().$type<JSONType>(),
    creatorId: uuid().references(() => user.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
    vectorizedStringId: integer()
      .notNull()
      .references(() => vectorizedString.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    approvedTranslationId: integer().references(
      (): PgColumn => translation.id,
      {
        onDelete: "set null",
        onUpdate: "cascade",
      },
    ),
    ...timestamps,
  },
  (table) => [
    // Composite index for faster element listing by document and sort order
    index().using(
      "btree",
      table.documentId.asc().nullsLast(),
      table.sortIndex.asc().nullsLast(),
    ),
  ],
);

export const comment = pgTable(
  "Comment",
  {
    id: serial().primaryKey(),
    targetType: commentTargetType().notNull(),
    targetId: integer().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    content: text().notNull(),
    parentCommentId: integer(),
    rootCommentId: integer(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    ...timestamps,
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
    index().using("btree", table.userId.asc().nullsLast()),
    index().on(table.targetType, table.targetId),
  ],
);

export const commentReaction = pgTable(
  "CommentReaction",
  {
    id: serial().primaryKey(),
    commentId: integer()
      .notNull()
      .references(() => comment.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    type: commentReactionType().notNull(),
    ...timestamps,
  },
  (table) => [
    // Default index name over 63 bytes
    index().using("btree", table.commentId.asc().nullsLast()),
    index().using("btree", table.userId.asc().nullsLast()),
    unique().on(table.commentId, table.userId),
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
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.translatableElementId.asc().nullsLast()),
  ],
);

export const vectorizedString = pgTable(
  "VectorizedString",
  {
    id: serial().primaryKey(),
    value: text().notNull(),
    languageId: text()
      .notNull()
      .references(() => language.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    chunkSetId: integer().references(() => chunkSet.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
    status: text().notNull().default("PENDING_VECTORIZE"),
  },
  (table) => [
    unique().on(table.languageId, table.value),
    // pg_trgm GIN index for fast bidirectional ILIKE matching (term.lookup)
    index("idx_vectorized_string_value_trgm").using(
      "gin",
      sql`${table.value} gin_trgm_ops`,
    ),
    // Index for faster language lookup
    index().using("btree", table.languageId.asc().nullsLast()),
    // Index for status-based filtering
    index().using("btree", table.status.asc().nullsLast()),
  ],
);

export const translation = pgTable(
  "Translation",
  {
    id: serial().primaryKey(),
    translatorId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    translatableElementId: integer()
      .notNull()
      .references(() => translatableElement.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    meta: jsonb().$type<JSONType>(),
    stringId: integer()
      .notNull()
      .references(() => vectorizedString.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.translatorId.asc().nullsLast(),
      table.translatableElementId.asc().nullsLast(),
      table.stringId.asc().nullsLast(),
    ),
    // Index for faster translation lookup by element
    index().using("btree", table.translatableElementId.asc().nullsLast()),
  ],
);

export const translationSnapshot = pgTable("TranslationSnapshot", {
  id: serial().primaryKey(),
  projectId: uuid()
    .notNull()
    .references(() => project.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  creatorId: uuid().references(() => user.id, {
    onDelete: "set null",
    onUpdate: "cascade",
  }),
  ...timestamps,
});

export const translationSnapshotItem = pgTable("TranslationSnapshotItem", {
  id: serial().primaryKey(),
  snapshotId: integer()
    .notNull()
    .references(() => translationSnapshot.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  translationId: integer()
    .notNull()
    .references(() => translation.id, {
      onDelete: "restrict",
      onUpdate: "cascade",
    }),
  ...timestamps,
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
    ...timestamps,
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

export const qaResult = pgTable("QaResult", {
  id: serial().primaryKey(),
  translationId: integer()
    .notNull()
    .references(() => translation.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const qaResultItem = pgTable("QaResultItem", {
  id: serial().primaryKey(),
  meta: jsonb().$type<NonNullJSONType>(),
  isPassed: boolean().notNull(),
  resultId: integer()
    .notNull()
    .references(() => qaResult.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  checkerId: integer()
    .notNull()
    .references(() => pluginService.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  ...timestamps,
});

export const user = pgTable(
  "User",
  {
    id: uuid().defaultRandom().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    avatarFileId: integer().references(() => file.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    ...timestamps,
  },
  (table) => [unique().on(table.email, table.name)],
);

// ─── Agent System ───

export const agentDefinitionType = pgEnum(
  "AgentDefinitionType",
  AgentDefinitionTypeValues,
);

export const agentSessionStatus = pgEnum(
  "AgentSessionStatus",
  AgentSessionStatusValues,
);

export const agentToolTarget = pgEnum("AgentToolTarget", AgentToolTargetValues);

export const agentToolConfirmationStatus = pgEnum(
  "AgentToolConfirmationStatus",
  AgentToolConfirmationStatusValues,
);

export const agentSessionTrustPolicy = pgEnum(
  "AgentSessionTrustPolicy",
  AgentSessionTrustPolicyValues,
);

export const agentDefinition = pgTable("AgentDefinition", {
  id: serial().primaryKey(),
  externalId: uuid().defaultRandom().notNull().unique(),
  scopeType: scopeType().notNull().default("GLOBAL"),
  /** Empty string for GLOBAL scope; project externalId for PROJECT scope */
  scopeId: text().notNull().default(""),
  name: text().notNull(),
  description: text().notNull().default(""),
  /** Agent usage type/category */
  type: agentDefinitionType().notNull().default("GENERAL"),

  // ── r2: 元数据列 (replaces single `definition` JSONB column) ──
  /**
   * Human-readable slug ID from frontmatter (e.g. "translator-zh-en").
   * Distinct from `id` (serial PK) and `externalId` (UUID for API exposure).
   */
  definitionId: text().notNull().default(""),
  version: text().notNull().default("1.0.0"),
  icon: text(),
  /** LLM configuration (providerId, temperature, maxTokens) */
  llmConfig: jsonb().$type<AgentLLMConfig | null>(),
  /** List of allowed tool names */
  tools: jsonb().$type<string[]>().notNull().default([]),
  /** Prompt auto-injection configuration */
  promptConfig: jsonb().$type<AgentPromptConfig | null>(),
  /** Runtime constraints */
  constraints: jsonb().$type<AgentConstraints | null>(),
  /** Security policy */
  securityPolicy: jsonb().$type<AgentSecurityPolicy | null>(),
  /** Multi-agent orchestration config */
  orchestration: jsonb().$type<Orchestration | null>(),
  /** MD body / system prompt content (supports {{variable}} interpolation) */
  content: text().notNull().default(""),

  isBuiltin: boolean().notNull().default(false),
  ...timestamps,
});

export const agentSession = pgTable(
  "AgentSession",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    agentDefinitionId: integer()
      .notNull()
      .references(() => agentDefinition.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    userId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Optional project association for workflow runs */
    projectId: uuid().references(() => project.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    status: agentSessionStatus().notNull().default("ACTIVE"),
    /** Current active run (Graph runtime) */
    currentRunId: integer(),
    /** Optional Kanban card associated with this session */
    kanbanCardId: integer(),
    /** Maximum number of DAG turns for this session (snapshot of agentDefinition.constraints.maxSteps at creation) */
    maxTurns: integer().default(50).notNull(),
    /** Current DAG loop turn count (incremented by DecisionNode each cycle) */
    currentTurn: integer().default(0).notNull(),
    /** Session-level trust policy for tool confirmation */
    trustPolicy: agentSessionTrustPolicy().notNull().default("CONFIRM_ALL"),
    /** Business context metadata (e.g. projectId, documentId) */
    metadata: jsonb().$type<JSONType>().notNull().default({}),
    ...timestamps,
  },
  (table) => [
    index().on(table.agentDefinitionId),
    index().on(table.userId),
    index().on(table.projectId),
  ],
);

export const agentRun = pgTable(
  "AgentRun",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    sessionId: integer()
      .notNull()
      .references(() => agentSession.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** running | paused | completed | failed | cancelled */
    status: text().notNull().default("running"),
    graphDefinition: jsonb().$type<NonNullJSONType>().notNull(),
    blackboardSnapshot: jsonb().$type<JSONType>(),
    currentNodeId: text(),
    deduplicationKey: text(),
    startedAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),
    metadata: jsonb().$type<JSONType>(),
  },
  (table) => [
    index().on(table.sessionId),
    index().on(table.status),
    index().on(table.deduplicationKey),
  ],
);

export const agentEvent = pgTable(
  "AgentEvent",
  {
    id: serial().primaryKey(),
    runId: integer()
      .notNull()
      .references(() => agentRun.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    eventId: uuid().defaultRandom().notNull(),
    parentEventId: uuid(),
    nodeId: text(),
    type: text().notNull(),
    payload: jsonb().$type<NonNullJSONType>().notNull(),
    timestamp: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.runId),
    index().on(table.type),
    unique().on(table.runId, table.eventId),
  ],
);

export const agentExternalOutput = pgTable(
  "AgentExternalOutput",
  {
    id: serial().primaryKey(),
    runId: integer()
      .notNull()
      .references(() => agentRun.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nodeId: text().notNull(),
    /** llm_response | tool_result */
    outputType: text().notNull(),
    outputKey: text().notNull(),
    payload: jsonb().$type<NonNullJSONType>().notNull(),
    idempotencyKey: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.runId),
    index().on(table.nodeId),
    unique().on(table.runId, table.outputKey, table.idempotencyKey),
  ],
);

// ─── Kanban System ───

export const kanbanCardStatus = pgEnum(
  "KanbanCardStatus",
  KanbanCardStatusValues,
);

export const kanbanBoard = pgTable(
  "KanbanBoard",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    orgId: uuid().references(() => project.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    name: text().notNull(),
    /** Column definitions — ordered list of column metadata */
    columns: jsonb().$type<NonNullJSONType>().notNull().default([]),
    /** Type of resource this board is linked to (e.g. "project", "document") */
    linkedResourceType: text(),
    /** External ID of the linked resource */
    linkedResourceId: text(),
    /** Extra metadata for extensibility */
    metadata: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().on(table.orgId),
    index().on(table.linkedResourceType, table.linkedResourceId),
  ],
);

export const kanbanCard = pgTable(
  "KanbanCard",
  {
    id: serial().primaryKey(),
    externalId: uuid().defaultRandom().notNull().unique(),
    boardId: integer()
      .notNull()
      .references(() => kanbanBoard.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /** Which column within the board this card belongs to (column id from board.columns) */
    columnId: text().notNull().default(""),
    title: text().notNull(),
    description: text().notNull().default(""),
    /** Agent that has claimed/is working on this card */
    assigneeAgentId: integer().references(() => agentDefinition.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** Human user that has claimed/is working on this card */
    assigneeUserId: uuid().references(() => user.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    /** When the card was claimed */
    claimedAt: timestamp({ withTimezone: true }),
    /** Who claimed it — "agent:<agentId>" or "user:<userId>" */
    claimedBy: text(),
    priority: integer().notNull().default(0),
    dueDate: timestamp({ withTimezone: true }),
    /** Array of label strings */
    labels: jsonb().$type<string[]>().notNull().default([]),
    /** Type of linked resource (e.g. "task", "translation") */
    linkedResourceType: text(),
    /** External ID of the linked resource */
    linkedResourceId: text(),
    status: kanbanCardStatus().notNull().default("OPEN"),
    /** Parent card for subtask grouping */
    parentCardId: integer(),
    /** How many translation units are in this batch */
    batchSize: integer().notNull().default(1),
    metadata: jsonb().$type<JSONType>(),
    /** List of related ChangeSet external IDs */
    linkedChangesetIds: jsonb().$type<string[]>(),
    ...timestamps,
  },
  (table) => [
    index().on(table.boardId),
    index().on(table.status),
    index().on(table.assigneeAgentId),
    index().on(table.boardId, table.status),
  ],
);

// ─── ChangeSet / EntityVCS Tables ───────────────────────────

export const changeset = pgTable("Changeset", {
  id: serial().primaryKey(),
  externalId: uuid().notNull().unique().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  agentRunId: integer().references(() => agentRun.id, {
    onDelete: "set null",
  }),
  linkedCardId: integer().references(() => kanbanCard.id, {
    onDelete: "set null",
  }),
  status: changesetStatus().notNull().default("PENDING"),
  createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
  reviewedBy: uuid().references(() => user.id, { onDelete: "set null" }),
  summary: text(),
  asyncStatus: changesetEntryAsyncStatus(),
  reviewedAt: timestamp({ withTimezone: true }),
  appliedAt: timestamp({ withTimezone: true }),
  ...timestamps,
});

export const changesetEntry = pgTable(
  "ChangesetEntry",
  {
    id: serial().primaryKey(),
    changesetId: integer()
      .notNull()
      .references(() => changeset.id, { onDelete: "cascade" }),
    entityType: entityType().notNull(),
    entityId: text().notNull(),
    action: changeAction().notNull(),
    before: jsonb().$type<JSONType>(),
    after: jsonb().$type<JSONType>(),
    fieldPath: text(),
    riskLevel: riskLevel().notNull().default("LOW"),
    reviewStatus: reviewStatus().notNull().default("PENDING"),
    asyncStatus: asyncStatus(),
    asyncTaskIds: jsonb().$type<string[]>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.changesetId),
    index().using("btree", table.entityType, table.entityId),
  ],
);

export const entitySnapshot = pgTable("EntitySnapshot", {
  id: serial().primaryKey(),
  externalId: uuid().notNull().unique().defaultRandom(),
  projectId: uuid()
    .notNull()
    .references(() => project.id, { onDelete: "cascade" }),
  name: text().notNull(),
  description: text(),
  /** PROJECT | DOCUMENT | ELEMENT */
  level: text().notNull().default("PROJECT"),
  scopeFilter: jsonb().$type<JSONType>(),
  createdBy: uuid().references(() => user.id, { onDelete: "set null" }),
  ...timestamps,
});

export const kanbanCardDep = pgTable(
  "KanbanCardDep",
  {
    cardId: integer()
      .notNull()
      .references(() => kanbanCard.id, { onDelete: "cascade" }),
    dependsOnCardId: integer()
      .notNull()
      .references(() => kanbanCard.id, { onDelete: "cascade" }),
    /** FINISH_TO_START | DATA */
    depType: text().notNull().default("FINISH_TO_START"),
  },
  (table) => [primaryKey({ columns: [table.cardId, table.dependsOnCardId] })],
);

export const toolCallLog = pgTable(
  "ToolCallLog",
  {
    id: serial().primaryKey(),
    sessionId: integer()
      .notNull()
      .references(() => agentSession.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    runId: integer()
      .notNull()
      .references(() => agentRun.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    nodeId: text(),
    toolName: text().notNull(),
    /** Tool call arguments as JSON */
    arguments: jsonb().$type<NonNullJSONType>().notNull().default({}),
    /** Tool call result as JSON */
    result: jsonb().$type<JSONType>(),
    /** Error message if the call failed */
    error: text(),
    /** Duration in milliseconds */
    durationMs: integer(),
    sideEffectType: text().notNull().default("none"),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index().on(table.sessionId), index().on(table.runId)],
);

// ============ Permission System Tables ============

export const role = pgTable("Role", {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
  description: text(),
  isSystem: boolean().default(false).notNull(),
  ...timestamps,
});

export const userRole = pgTable(
  "UserRole",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    roleId: integer()
      .notNull()
      .references(() => role.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (table) => [unique().on(table.userId, table.roleId)],
);

export const permissionTuple = pgTable(
  "PermissionTuple",
  {
    id: serial().primaryKey(),
    subjectType: subjectType().notNull(),
    subjectId: text().notNull(),
    relation: relation().notNull(),
    objectType: objectType().notNull(),
    /** Resource ID; use "*" for system-level objects */
    objectId: text().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(
      table.subjectType,
      table.subjectId,
      table.relation,
      table.objectType,
      table.objectId,
    ),
    index().on(table.subjectType, table.subjectId),
    index().on(table.objectType, table.objectId),
  ],
);

export const authAuditLog = pgTable("AuthAuditLog", {
  id: serial().primaryKey(),
  timestamp: timestamp({ withTimezone: true }).defaultNow().notNull(),
  subjectType: subjectType().notNull(),
  subjectId: text().notNull(),
  action: permissionAction().notNull(),
  objectType: objectType().notNull(),
  objectId: text().notNull(),
  relation: relation().notNull(),
  result: boolean().notNull(),
  traceId: text(),
  ip: text(),
  userAgent: text(),
});

// ====== API Key ======
export const apiKey = pgTable(
  "ApiKey",
  {
    id: serial().primaryKey(),
    name: text().notNull(),
    keyHash: text().notNull(),
    keyPrefix: text().notNull(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scopes: jsonb().$type<string[]>().notNull().default([]),
    expiresAt: timestamp({ withTimezone: true }),
    lastUsedAt: timestamp({ withTimezone: true }),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    index().on(table.userId),
    index().on(table.keyHash),
    index().on(table.keyPrefix),
  ],
);

// ====== Persistent Session Record ======
export const sessionRecord = pgTable(
  "SessionRecord",
  {
    id: text().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ip: text(),
    userAgent: text(),
    authProviderId: integer(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    revokedAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [index().on(table.userId)],
);

// ====== Login Attempt (Rate Limiting & Audit) ======
export const loginAttempt = pgTable(
  "LoginAttempt",
  {
    id: serial().primaryKey(),
    identifier: text().notNull(),
    ip: text(),
    userAgent: text(),
    success: boolean().notNull(),
    failReason: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index().on(table.ip),
    index().on(table.identifier),
    index().on(table.createdAt),
  ],
);

// ====== Auth Flow Audit Log ======
export const authFlowLog = pgTable(
  "AuthFlowLog",
  {
    id: serial().primaryKey(),
    /** The auth flow's Redis flowId (UUID) */
    flowId: text().notNull(),
    /** Which flow definition was used, e.g. "standard-login" */
    flowDefId: text().notNull(),
    /** User ID if the flow successfully resolved identity */
    userId: uuid().references(() => user.id, { onDelete: "set null" }),
    /** Final status of the flow */
    status: text().notNull(),
    /** The terminal node reached (e.g. "finalize", "user-not-found") */
    finalNode: text(),
    /** Authenticator Assurance Level achieved */
    aal: integer(),
    ip: text(),
    userAgent: text(),
    /** Flow duration in milliseconds */
    durationMs: integer(),
    createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
    completedAt: timestamp({ withTimezone: true }),
  },
  (table) => [
    index().on(table.userId),
    index().on(table.flowId),
    index().on(table.createdAt),
  ],
);

// ====== Message System ======

export const notification = pgTable(
  "Notification",
  {
    id: serial().primaryKey(),
    recipientId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    category: messageCategory().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    data: jsonb().$type<JSONType>(),
    status: notificationStatus()
      .notNull()
      .$type<NotificationStatus>()
      .default("UNREAD"),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.recipientId.asc().nullsLast()),
    index().using("btree", table.status.asc().nullsLast()),
    index().on(table.recipientId, table.status),
    index().on(table.recipientId, table.createdAt),
  ],
);

export const userMessagePreference = pgTable(
  "UserMessagePreference",
  {
    id: serial().primaryKey(),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade", onUpdate: "cascade" }),
    category: messageCategory().notNull(),
    channel: messageChannel().notNull(),
    enabled: boolean().notNull().default(true),
    ...timestamps,
  },
  (table) => [
    unique().on(table.userId, table.category, table.channel),
    index().using("btree", table.userId.asc().nullsLast()),
  ],
);
