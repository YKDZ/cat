import { relations } from "drizzle-orm";
import {
  pgTable,
  vector as pgVector,
  serial,
  integer,
  jsonb,
  foreignKey,
} from "drizzle-orm/pg-core";
import { translation } from "./translation.ts";
import { translatableString } from "./document.ts";
import { memoryItem } from "./memory.ts";
import { pluginService } from "./plugin.ts";

export const vector = pgTable(
  "Vector",
  {
    id: serial().primaryKey().notNull(),
    vector: pgVector({ dimensions: 1024 }).notNull(),
    meta: jsonb(),
    vectorizerId: integer().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.vectorizerId],
      foreignColumns: [pluginService.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const vectorRelations = relations(vector, ({ one, many }) => ({
  Vectorizer: one(pluginService),

  Translations: many(translation),
  MemoryItemSourceEmbeddings: many(memoryItem, {
    relationName: "sourceEmbedding",
  }),
  MemoryItemTranslationEmbeddings: many(memoryItem, {
    relationName: "translationEmbedding",
  }),
  TranslatableStrings: many(translatableString),
}));
