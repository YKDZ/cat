import { relations } from "drizzle-orm";
import {
  pgTable,
  vector as pgVector,
  serial,
  integer,
  jsonb,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { translatableString } from "./document.ts";
import { pluginService } from "./plugin.ts";
import { timestamps } from "./reuse.ts";
import { JSONType } from "@cat/shared/schema/json";

export const chunkSet = pgTable("ChunkSet", {
  id: serial().primaryKey().notNull(),
  meta: jsonb().$type<JSONType>(),
  ...timestamps,
});

export const chunk = pgTable(
  "Chunk",
  {
    id: serial().primaryKey().notNull(),
    meta: jsonb().$type<JSONType>(),
    chunkSetId: integer().notNull(),
    vectorizerId: integer().notNull(),
    vectorStorageId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    index().on(table.chunkSetId),
    foreignKey({
      columns: [table.chunkSetId],
      foreignColumns: [chunkSet.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    foreignKey({
      columns: [table.vectorizerId],
      foreignColumns: [pluginService.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const vector = pgTable(
  "Vector",
  {
    id: serial().primaryKey().notNull(),
    vector: pgVector({ dimensions: 1024 }).notNull(),
    chunkId: integer().notNull(),
  },
  (table) => [
    index().using("hnsw", table.vector.op("vector_cosine_ops")),
    foreignKey({
      columns: [table.chunkId],
      foreignColumns: [chunk.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
  ],
);

export const chunkSetRelations = relations(chunkSet, ({ many }) => ({
  Chunks: many(chunk),
  TranslatableStrings: many(translatableString),
}));

export const chunkRelations = relations(chunk, ({ one }) => ({
  Vectorizer: one(pluginService, {
    fields: [chunk.vectorizerId],
    references: [pluginService.id],
    relationName: "chunkVectorizerService",
  }),
  VectorStorage: one(pluginService, {
    fields: [chunk.vectorStorageId],
    references: [pluginService.id],
    relationName: "chunkVectorStorageService",
  }),

  ChunkSet: one(chunkSet, {
    fields: [chunk.chunkSetId],
    references: [chunkSet.id],
  }),
}));

export const vectorRelations = relations(vector, ({ one }) => ({
  Chunk: one(chunk, {
    fields: [vector.chunkId],
    references: [chunk.id],
  }),
}));
