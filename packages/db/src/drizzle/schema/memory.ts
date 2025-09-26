import {
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps, uuidId } from "../utils/reuse.ts";
import { project } from "./project.ts";
import { language } from "./misc.ts";
import { translation } from "./translation.ts";
import { translatableElement } from "./document.ts";
import { user } from "./user.ts";
import { vector } from "./vector.ts";

export const memory = pgTable(
  "Memory",
  {
    id: uuidId(),
    name: text().notNull(),
    description: text(),
    creatorId: uuid().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const memoryItem = pgTable(
  "MemoryItem",
  {
    id: serial().primaryKey().notNull(),
    source: text().notNull(),
    translation: text().notNull(),
    sourceEmbeddingId: integer().notNull(),
    creatorId: uuid().notNull(),
    memoryId: uuid().notNull(),
    sourceElementId: integer(),
    translationId: integer(),
    sourceLanguageId: text().notNull(),
    translationLanguageId: text().notNull(),
    translationEmbeddingId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.sourceEmbeddingId],
      foreignColumns: [vector.id],
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
      columns: [table.memoryId],
      foreignColumns: [memory.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.sourceElementId],
      foreignColumns: [translatableElement.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.translationId],
      foreignColumns: [translation.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.sourceLanguageId],
      foreignColumns: [language.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.translationLanguageId],
      foreignColumns: [language.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.translationEmbeddingId],
      foreignColumns: [vector.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const memoryToProject = pgTable(
  "MemoryToProject",
  {
    memoryId: uuid().notNull(),
    projectId: uuid().notNull(),
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    foreignKey({
      columns: [table.memoryId],
      foreignColumns: [memory.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.projectId],
      foreignColumns: [project.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    primaryKey({
      columns: [table.memoryId, table.projectId],
    }),
  ],
);

export const memoryRelations = relations(memory, ({ one, many }) => ({
  Creator: one(user, {
    fields: [memory.creatorId],
    references: [user.id],
  }),
  MemoryItems: many(memoryItem),
  MemoryToProjects: many(memoryToProject),
}));

export const memoryItemRelations = relations(memoryItem, ({ one }) => ({
  Creator: one(user, {
    fields: [memoryItem.creatorId],
    references: [user.id],
  }),
  Memory: one(memory, {
    fields: [memoryItem.memoryId],
    references: [memory.id],
  }),
  TranslatableElement: one(translatableElement, {
    fields: [memoryItem.sourceElementId],
    references: [translatableElement.id],
  }),
  Translation: one(translation, {
    fields: [memoryItem.translationId],
    references: [translation.id],
  }),
  SourceLanguage: one(language, {
    fields: [memoryItem.sourceLanguageId],
    references: [language.id],
    relationName: "sourceLanguage",
  }),
  TranslationLanguage: one(language, {
    fields: [memoryItem.translationLanguageId],
    references: [language.id],
    relationName: "translationLanguage",
  }),
  SourceEmbedding: one(vector, {
    fields: [memoryItem.sourceEmbeddingId],
    references: [vector.id],
    relationName: "sourceEmbedding",
  }),
  TranslationEmbedding: one(vector, {
    fields: [memoryItem.translationEmbeddingId],
    references: [vector.id],
    relationName: "translationEmbedding",
  }),
}));

export const memoryToProjectRelations = relations(
  memoryToProject,
  ({ one }) => ({
    Memory: one(memory, {
      fields: [memoryToProject.memoryId],
      references: [memory.id],
    }),
    Project: one(project, {
      fields: [memoryToProject.projectId],
      references: [project.id],
    }),
  }),
);
