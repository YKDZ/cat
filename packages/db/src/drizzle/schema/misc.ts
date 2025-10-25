import {
  index,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps, uuidId } from "./reuse.ts";
import { projectTargetLanguage } from "./project.ts";
import { term } from "./glossary.ts";
import { memoryItem } from "./memory.ts";
import { translation } from "./translation.ts";
import { documentToTask, translatableString } from "./document.ts";

export const language = pgTable("Language", {
  id: text().primaryKey().notNull(),
  name: text().notNull(),
});

export const setting = pgTable(
  "Setting",
  {
    id: serial().primaryKey().notNull(),
    key: text().notNull(),
    value: jsonb().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using("btree", table.key.asc().nullsLast().op("text_ops")),
  ],
);

export const task = pgTable(
  "Task",
  {
    id: uuidId(),
    status: text().default("pending").notNull(),
    type: text().notNull(),
    meta: jsonb(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.meta.asc().nullsLast().op("jsonb_ops")),
  ],
);

export const languageRelations = relations(language, ({ many }) => ({
  Translations: many(translation),
  Terms: many(term),
  MemoryItemSourceLanguages: many(memoryItem, {
    relationName: "sourceLanguage",
  }),
  MemoryItemTranslationLanguages: many(memoryItem, {
    relationName: "translationLanguage",
  }),
  ProjectTargetLanguages: many(projectTargetLanguage),
  TranslatableStrings: many(translatableString),
}));

export const taskRelations = relations(task, ({ many }) => ({
  DocumentToTasks: many(documentToTask),
}));
