import {
  boolean,
  check,
  foreignKey,
  integer,
  pgTable,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { bytea, timestamps } from "./reuse.ts";
import { pluginService } from "./plugin.ts";
import { document, translatableElementContext } from "./document.ts";
import { user } from "./user.ts";

export const file = pgTable(
  "File",
  {
    id: serial().primaryKey().notNull(),
    name: text().notNull(),
    blobId: integer().notNull(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    foreignKey({
      columns: [table.blobId],
      foreignColumns: [blob.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const blob = pgTable(
  "Blob",
  {
    id: serial().primaryKey().notNull(),
    key: text().notNull(),
    storageProviderId: integer().notNull(),
    hash: bytea().unique(),
    referenceCount: integer().notNull().default(1),
    createdAt: timestamps.createdAt,
  },
  (table) => [
    unique().on(table.storageProviderId, table.key),
    check("referenceCount_check1", sql`${table.referenceCount} >= 0`),
    check("hash_check1", sql`octet_length(${table.hash}) = 32`),
    foreignKey({
      columns: [table.storageProviderId],
      foreignColumns: [pluginService.id],
    })
      .onUpdate("cascade")
      .onDelete("restrict"),
  ],
);

export const fileRelations = relations(file, ({ one }) => ({
  Document: one(document, {
    fields: [file.id],
    references: [document.fileId],
  }),
  AvatarUser: one(user, {
    fields: [file.id],
    references: [user.avatarFileId],
  }),
  Blob: one(blob, {
    fields: [file.blobId],
    references: [blob.id],
  }),
  TranslatableElementContext: one(translatableElementContext, {
    fields: [file.id],
    references: [translatableElementContext.fileId],
  }),
}));

export const blobRelations = relations(blob, ({ one, many }) => ({
  StorageProvider: one(pluginService, {
    fields: [blob.storageProviderId],
    references: [pluginService.id],
  }),
  Files: many(file),
}));
