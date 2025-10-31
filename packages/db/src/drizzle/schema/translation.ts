import {
  boolean,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./reuse.ts";
import { user } from "./user.ts";
import { translatableElement, translatableString } from "./document.ts";
import { memoryItem } from "./memory.ts";

export const translation = pgTable(
  "Translation",
  {
    id: serial().primaryKey().notNull(),
    stringId: integer().notNull(),
    translatorId: uuid().notNull(),
    translatableElementId: integer().notNull(),
    meta: jsonb(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.translatorId.asc().nullsLast(),
      table.translatableElementId.asc().nullsLast().op("int4_ops"),
      table.stringId.asc().nullsLast().op("int4_ops"),
    ),
    foreignKey({
      columns: [table.stringId],
      foreignColumns: [translatableString.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
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
  TranslatableString: one(translatableString, {
    fields: [translation.stringId],
    references: [translatableString.id],
  }),
  Translator: one(user, {
    fields: [translation.translatorId],
    references: [user.id],
  }),
  TranslatableElement: one(translatableElement, {
    fields: [translation.translatableElementId],
    references: [translatableElement.id],
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
