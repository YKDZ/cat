import { relations } from "drizzle-orm";
import {
  pgTable,
  vector as pgVector,
  serial,
  integer,
  jsonb,
} from "drizzle-orm/pg-core";
import { translation } from "./translation.ts";
import { translatableElement } from "./document.ts";
import { memoryItem } from "./memory.ts";
import { pluginService } from "./plugin.ts";

export const vector = pgTable("Vector", {
  id: serial().primaryKey().notNull(),
  vector: pgVector({ dimensions: 1024 }).notNull(),
  meta: jsonb(),
  vectorizerId: integer().notNull(),
});

export const vectorRelations = relations(vector, ({ one, many }) => ({
  Vectorizer: one(pluginService),
  Translations: many(translation),
  TranslatableElements: many(translatableElement),
  MemoryItemSourceEmbeddings: many(memoryItem, {
    relationName: "sourceEmbedding",
  }),
  MemoryItemTranslationEmbeddings: many(memoryItem, {
    relationName: "translationEmbedding",
  }),
}));
