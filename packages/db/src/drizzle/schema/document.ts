import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps, uuidId } from "./reuse.ts";
import { language, task } from "./misc.ts";
import { project } from "./project.ts";
import { user } from "./user.ts";
import { pluginService } from "./plugin.ts";
import { vector } from "./vector.ts";
import { file } from "./file.ts";
import { translation } from "./translation.ts";
import { memoryItem } from "./memory.ts";

export const document = pgTable(
  "Document",
  {
    id: uuidId(),
    name: text(),
    projectId: uuid().notNull(),
    creatorId: uuid().notNull(),
    fileHandlerId: integer(),
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
  ],
);

export const translatableElement = pgTable(
  "TranslatableElement",
  {
    id: serial().primaryKey().notNull(),
    value: text().notNull(),
    meta: jsonb(),
    documentId: uuid().notNull(),
    embeddingId: integer().notNull(),
    documentVersionId: integer(),
    sortIndex: integer().notNull(),
    creatorId: uuid(),
    languageId: text().notNull(),
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
      columns: [table.embeddingId],
      foreignColumns: [vector.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
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
      columns: [table.languageId],
      foreignColumns: [language.id],
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
    Document: one(document, {
      fields: [translatableElement.documentId],
      references: [document.id],
    }),
    Embedding: one(vector, {
      fields: [translatableElement.embeddingId],
      references: [vector.id],
    }),
    DocumentVersion: one(documentVersion, {
      fields: [translatableElement.documentVersionId],
      references: [documentVersion.id],
    }),
    Creator: one(user, {
      fields: [translatableElement.creatorId],
      references: [user.id],
    }),
    Language: one(language, {
      fields: [translatableElement.languageId],
      references: [language.id],
    }),
    MemoryItems: many(memoryItem),
    Translations: many(translation),
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
