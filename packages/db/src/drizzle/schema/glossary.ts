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
import { timestamps, uuidId } from "./reuse.ts";
import { project } from "./project.ts";
import { user } from "./user.ts";
import { translatableString } from "./document.ts";

export const glossary = pgTable(
  "Glossary",
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
      .onDelete("cascade"),
  ],
);

export const term = pgTable(
  "Term",
  {
    id: serial().primaryKey().notNull(),
    stringId: integer().notNull(),
    creatorId: uuid().notNull(),
    glossaryId: uuid().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.stringId],
      foreignColumns: [translatableString.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.glossaryId],
      foreignColumns: [glossary.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const termRelation = pgTable(
  "TermRelation",
  {
    id: serial().primaryKey().notNull(),
    termId: integer().notNull(),
    translationId: integer().notNull(),
  },
  (table) => [
    index().using(
      "btree",
      table.translationId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.termId],
      foreignColumns: [term.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
    foreignKey({
      columns: [table.translationId],
      foreignColumns: [term.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const glossaryToProject = pgTable(
  "GlossaryToProject",
  {
    glossaryId: uuid().notNull(),
    projectId: uuid().notNull(),
  },
  (table) => [
    index().using("btree", table.projectId.asc().nullsLast()),
    foreignKey({
      columns: [table.glossaryId],
      foreignColumns: [glossary.id],
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
      columns: [table.glossaryId, table.projectId],
    }),
  ],
);

export const glossaryRelations = relations(glossary, ({ one, many }) => ({
  Creator: one(user, {
    fields: [glossary.creatorId],
    references: [user.id],
  }),
  Terms: many(term),
  Projects: many(glossaryToProject),
}));

export const termRelations = relations(term, ({ one, many }) => ({
  Creator: one(user, {
    fields: [term.creatorId],
    references: [user.id],
  }),
  Glossary: one(glossary, {
    fields: [term.glossaryId],
    references: [glossary.id],
  }),
  Terms: many(termRelation, {
    relationName: "term",
  }),
  Translations: many(termRelation, {
    relationName: "translation",
  }),
}));

export const termRelationRelations = relations(termRelation, ({ one }) => ({
  Term: one(term, {
    fields: [termRelation.termId],
    references: [term.id],
    relationName: "term",
  }),
  Translation: one(term, {
    fields: [termRelation.translationId],
    references: [term.id],
    relationName: "translation",
  }),
}));

export const glossaryToProjectRelations = relations(
  glossaryToProject,
  ({ one }) => ({
    Glossary: one(glossary, {
      fields: [glossaryToProject.glossaryId],
      references: [glossary.id],
    }),
    Project: one(project, {
      fields: [glossaryToProject.projectId],
      references: [project.id],
    }),
  }),
);
