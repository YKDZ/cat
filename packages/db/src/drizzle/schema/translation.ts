import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./reuse.ts";
import { user } from "./user.ts";
import { language } from "./misc.ts";
import { translatableElement } from "./document.ts";
import { vector } from "./vector.ts";
import { memoryItem } from "./memory.ts";

export const translation = pgTable(
  "Translation",
  {
    id: serial().primaryKey().notNull(),
    value: text().notNull(),
    translatorId: uuid().notNull(),
    translatableElementId: integer().notNull(),
    languageId: text().notNull(),
    meta: jsonb(),
    embeddingId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.translatorId.asc().nullsLast(),
      table.languageId.asc().nullsLast().op("text_ops"),
      table.translatableElementId.asc().nullsLast().op("int4_ops"),
      table.value.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.translatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.translatableElementId],
      foreignColumns: [translatableElement.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.languageId],
      foreignColumns: [language.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.embeddingId],
      foreignColumns: [vector.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const translationVote = pgTable(
  "TranslationVote",
  {
    id: serial().primaryKey().notNull(),
    value: integer().default(0).notNull(),
    voterId: uuid().notNull(),
    translationId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    index().using(
      "btree",
      table.translationId.asc().nullsLast().op("int4_ops"),
    ),
    index().using("btree", table.voterId.asc().nullsLast()),
    uniqueIndex().using(
      "btree",
      table.voterId.asc().nullsLast(),
      table.translationId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.voterId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.translationId],
      foreignColumns: [translation.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const translationApprovement = pgTable(
  "TranslationApprovement",
  {
    id: serial().primaryKey().notNull(),
    isActive: boolean().default(false).notNull(),
    translationId: integer().notNull(),
    creatorId: uuid().notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.translationId],
      foreignColumns: [translation.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.creatorId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const translationRelations = relations(translation, ({ one, many }) => ({
  Translator: one(user, {
    fields: [translation.translatorId],
    references: [user.id],
  }),
  TranslatableElement: one(translatableElement, {
    fields: [translation.translatableElementId],
    references: [translatableElement.id],
  }),
  Language: one(language, {
    fields: [translation.languageId],
    references: [language.id],
  }),
  Embedding: one(vector, {
    fields: [translation.embeddingId],
    references: [vector.id],
  }),
  TranslationVotes: many(translationVote),
  MemoryItems: many(memoryItem),
  TranslationApprovements: many(translationApprovement),
}));

export const translationVoteRelations = relations(
  translationVote,
  ({ one }) => ({
    Translation: one(translation, {
      fields: [translationVote.translationId],
      references: [translation.id],
    }),
    Voter: one(user, {
      fields: [translationVote.voterId],
      references: [user.id],
    }),
  }),
);

export const TranslationApprovementRelations = relations(
  translationApprovement,
  ({ one }) => ({
    Translation: one(translation, {
      fields: [translationApprovement.translationId],
      references: [translation.id],
    }),
    Creator: one(user, {
      fields: [translationApprovement.creatorId],
      references: [user.id],
    }),
  }),
);
