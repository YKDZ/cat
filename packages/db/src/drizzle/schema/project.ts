import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps, uuidId } from "./reuse.ts";
import { user } from "./user.ts";
import { language } from "./misc.ts";
import { document, documentClosure } from "./document.ts";
import { memoryToProject } from "./memory.ts";
import { glossaryToProject } from "./glossary.ts";

export const project = pgTable(
  "Project",
  {
    id: uuidId(),
    name: text().notNull(),
    description: text(),
    creatorId: uuid().notNull(),
    ...timestamps,
  },
  (table) => [
    index().using("btree", table.creatorId.asc().nullsLast()),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const projectTargetLanguage = pgTable(
  "ProjectTargetLanguage",
  {
    languageId: text().notNull(),
    projectId: uuid().notNull(),
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    foreignKey({
      columns: [table.languageId],
      foreignColumns: [language.id],
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
      columns: [table.languageId, table.projectId],
    }),
  ],
);

export const projectRelations = relations(project, ({ one, many }) => ({
  Creator: one(user, {
    fields: [project.creatorId],
    references: [user.id],
  }),
  Documents: many(document),
  ProjectTargetLanguages: many(projectTargetLanguage),
  GlossaryToProjects: many(glossaryToProject),
  MemoryToProjects: many(memoryToProject),
  DocumentClosures: many(documentClosure),
}));

export const projectTargetLanguageRelations = relations(
  projectTargetLanguage,
  ({ one }) => ({
    Language: one(language, {
      fields: [projectTargetLanguage.languageId],
      references: [language.id],
    }),
    Project: one(project, {
      fields: [projectTargetLanguage.projectId],
      references: [project.id],
    }),
  }),
);
