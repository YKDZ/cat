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
import { documentToTask, translatableString } from "./document.ts";
import { JSONType } from "@cat/shared/schema/json";

export const language = pgTable("Language", {
  id: text().primaryKey().notNull(),
});

export const setting = pgTable(
  "Setting",
  {
    id: serial().primaryKey().notNull(),
    key: text().notNull(),
    value: jsonb().notNull().$type<Exclude<JSONType, null>>(),
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
    meta: jsonb().$type<JSONType>(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.meta.asc().nullsLast().op("jsonb_ops")),
  ],
);

export const languageRelations = relations(language, ({ many }) => ({
  ProjectTargetLanguages: many(projectTargetLanguage),
  TranslatableStrings: many(translatableString),
}));

export const taskRelations = relations(task, ({ many }) => ({
  DocumentToTasks: many(documentToTask),
}));
