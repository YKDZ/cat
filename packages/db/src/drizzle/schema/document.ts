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
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps, uuidId } from "./reuse.ts";
import { language, task } from "./misc.ts";
import { project } from "./project.ts";
import { user } from "./user.ts";
import { pluginService } from "./plugin.ts";
import { file } from "./file.ts";
import { translation } from "./translation.ts";
import { memoryItem } from "./memory.ts";
import { chunkSet } from "./vector.ts";
import { JSONType } from "@cat/shared/schema/json";
import {
  TranslatableElementContextTypeValues,
  TranslatableElementCommentReactionTypeValues,
} from "@cat/shared/schema/drizzle/enum";

export const translatableElementContextType = pgEnum(
  "TranslatableElementContextType",
  TranslatableElementContextTypeValues,
);

export const translatableElementCommentReactionType = pgEnum(
  "TranslatableElementCommentReactionType",
  TranslatableElementCommentReactionTypeValues,
);

export const document = pgTable(
  "Document",
  {
    id: uuidId(),
    name: text(),
    projectId: uuid().notNull(),
    creatorId: uuid().notNull(),
    fileHandlerId: integer(),
    fileId: integer(),
    isDirectory: boolean().default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [project.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.fileHandlerId],
      foreignColumns: [pluginService.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [file.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
  ],
);

export const translatableElement = pgTable(
  "TranslatableElement",
  {
    id: serial().primaryKey().notNull(),
    meta: jsonb().$type<JSONType>(),
    documentId: uuid().notNull(),
    documentVersionId: integer(),
    sortIndex: integer().notNull(),
    creatorId: uuid(),
    translatableStringId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [document.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.documentVersionId],
      foreignColumns: [documentVersion.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.translatableStringId],
      foreignColumns: [translatableString.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const translatableString = pgTable(
  "TranslatableString",
  {
    id: serial().primaryKey().notNull(),
    value: text().notNull(),
    languageId: text().notNull(),
    chunkSetId: integer().notNull(),
  },
  (table) => [
    unique().on(table.languageId, table.value),
    foreignKey({
      columns: [table.languageId],
      foreignColumns: [language.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.chunkSetId],
      foreignColumns: [chunkSet.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const documentVersion = pgTable(
  "DocumentVersion",
  {
    id: serial().primaryKey().notNull(),
    documentId: uuid().notNull(),
    isActive: boolean().default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [document.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const documentToTask = pgTable(
  "DocumentToTask",
  {
    documentId: uuid().notNull(),
    taskId: uuid().notNull(),
  },
  (table) => [
    index().using("btree", table.taskId.asc().nullsLast()),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [document.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.taskId],
      foreignColumns: [task.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    primaryKey({
      columns: [table.documentId, table.taskId],
    }),
  ],
);

export const documentClosure = pgTable(
  "DocumentClosure",
  {
    ancestor: uuid().notNull(),
    descendant: uuid().notNull(),
    depth: integer().notNull(),
    projectId: uuid().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.ancestor, table.descendant],
    }),
    index().using("btree", table.ancestor.asc().nullsLast()),
    index().using("btree", table.descendant.asc().nullsLast()),
    foreignKey({
      columns: [table.ancestor],
      foreignColumns: [document.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.descendant],
      foreignColumns: [document.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [project.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const translatableElementContext = pgTable(
  "TranslatableElementContext",
  {
    id: serial().primaryKey(),
    type: translatableElementContextType().notNull(),
    jsonData: jsonb().$type<JSONType>(),
    fileId: integer(),
    storageProviderId: integer(),
    textData: text(),
    translatableElementId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.translatableElementId),
    foreignKey({
      columns: [table.translatableElementId],
      foreignColumns: [translatableElement.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.fileId],
      foreignColumns: [file.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.storageProviderId],
      foreignColumns: [pluginService.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const translatableElementComment = pgTable(
  "TranslatableElementComment",
  {
    id: serial().primaryKey(),
    translatableElementId: integer().notNull(),
    userId: uuid().notNull(),
    content: text().notNull(),
    parentCommentId: integer(),
    /** Maintained by pg trigger. A root comment's rootCommentId is self id */
    rootCommentId: integer(),
    languageId: text().notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.translatableElementId),
    index().on(table.userId),
    index().on(table.parentCommentId),
    index().on(table.rootCommentId),
    foreignKey({
      columns: [table.translatableElementId],
      foreignColumns: [translatableElement.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
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
    foreignKey({
      columns: [table.languageId],
      foreignColumns: [language.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const translatableElementCommentReaction = pgTable(
  "TranslatableElementCommentReaction",
  {
    id: serial().primaryKey(),
    translatableElementCommentId: integer().notNull(),
    userId: uuid().notNull(),
    type: translatableElementCommentReactionType().notNull(),
    ...timestamps,
  },
  (table) => [
    unique().on(table.translatableElementCommentId, table.userId),
    index().on(table.translatableElementCommentId),
    index().on(table.userId),
    foreignKey({
      columns: [table.translatableElementCommentId],
      foreignColumns: [translatableElementComment.id],
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

export const translatableElementCommentReactionRelations = relations(
  translatableElementCommentReaction,
  ({ one }) => ({
    Comment: one(translatableElementComment, {
      fields: [translatableElementCommentReaction.translatableElementCommentId],
      references: [translatableElementComment.id],
    }),
    User: one(user, {
      fields: [translatableElementCommentReaction.userId],
      references: [user.id],
    }),
  }),
);

export const translatableElementCommentRelations = relations(
  translatableElementComment,
  ({ one, many }) => ({
    User: one(user, {
      fields: [translatableElementComment.userId],
      references: [user.id],
    }),
    TranslatableElement: one(translatableElement, {
      fields: [translatableElementComment.translatableElementId],
      references: [translatableElement.id],
    }),
    ParentComment: one(translatableElementComment, {
      fields: [translatableElementComment.parentCommentId],
      references: [translatableElementComment.id],
    }),
    RootComment: one(translatableElementComment, {
      fields: [translatableElementComment.rootCommentId],
      references: [translatableElementComment.id],
    }),
    Language: one(language, {
      fields: [translatableElementComment.languageId],
      references: [language.id],
    }),
    Reactions: many(translatableElementCommentReaction),
  }),
);

export const translatableElementContextRelations = relations(
  translatableElementContext,
  ({ one }) => ({
    TranslatableElement: one(translatableElement, {
      fields: [translatableElementContext.translatableElementId],
      references: [translatableElement.id],
    }),
    StorageProvider: one(pluginService, {
      fields: [translatableElementContext.storageProviderId],
      references: [pluginService.id],
    }),
    File: one(file, {
      fields: [translatableElementContext.fileId],
      references: [file.id],
    }),
  }),
);

export const documentClosureRelations = relations(
  documentClosure,
  ({ one }) => ({
    Ancestor: one(document, {
      fields: [documentClosure.ancestor],
      references: [document.id],
    }),
    Descendant: one(document, {
      fields: [documentClosure.descendant],
      references: [document.id],
    }),
    Project: one(project, {
      fields: [documentClosure.projectId],
      references: [project.id],
    }),
  }),
);

export const documentRelations = relations(document, ({ one, many }) => ({
  Project: one(project, {
    fields: [document.projectId],
    references: [project.id],
  }),
  Creator: one(user, {
    fields: [document.creatorId],
    references: [user.id],
  }),
  PluginService: one(pluginService, {
    fields: [document.fileHandlerId],
    references: [pluginService.id],
  }),
  File: one(file),
  TranslatableElements: many(translatableElement),
  DocumentVersions: many(documentVersion),
  DocumentToTasks: many(documentToTask),
}));

export const translatableElementRelations = relations(
  translatableElement,
  ({ one, many }) => ({
    TranslatableString: one(translatableString, {
      fields: [translatableElement.translatableStringId],
      references: [translatableString.id],
    }),
    Document: one(document, {
      fields: [translatableElement.documentId],
      references: [document.id],
    }),
    DocumentVersion: one(documentVersion, {
      fields: [translatableElement.documentVersionId],
      references: [documentVersion.id],
    }),
    Creator: one(user, {
      fields: [translatableElement.creatorId],
      references: [user.id],
    }),
    MemoryItems: many(memoryItem),
    Translations: many(translation),
    Contexts: many(translatableElementContext),
  }),
);

export const documentVersionRelations = relations(
  documentVersion,
  ({ one, many }) => ({
    Document: one(document, {
      fields: [documentVersion.documentId],
      references: [document.id],
    }),
    TranslatableElements: many(translatableElement),
  }),
);

export const documentToTaskRelations = relations(documentToTask, ({ one }) => ({
  Document: one(document, {
    fields: [documentToTask.documentId],
    references: [document.id],
  }),
  Task: one(task, {
    fields: [documentToTask.taskId],
    references: [task.id],
  }),
}));

export const translatableStringRelations = relations(
  translatableString,
  ({ one, many }) => ({
    Language: one(language, {
      fields: [translatableString.languageId],
      references: [language.id],
    }),
    ChunkSet: one(chunkSet, {
      fields: [translatableString.chunkSetId],
      references: [chunkSet.id],
    }),

    TranslatableElements: many(translatableElement),
    Translations: many(translation),
    SourceMemoryItems: many(memoryItem, {
      relationName: "memoryItemSourceString",
    }),
    TranslationMemoryItems: many(memoryItem, {
      relationName: "memoryItemTranslationString",
    }),
  }),
);
