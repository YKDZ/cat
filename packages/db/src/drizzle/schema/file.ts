import {
  foreignKey,
  integer,
  pgTable,
  serial,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps } from "./reuse.ts";
import { pluginService } from "./plugin.ts";
import { user } from "./user.ts";
import { document } from "./document.ts";

export const file = pgTable(
  "File",
  {
    id: serial().primaryKey().notNull(),
    originName: text().notNull(),
    storedPath: text().notNull(),
    documentId: uuid(),
    userId: uuid(),
    storageProviderId: integer().notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using("btree", table.documentId.asc().nullsLast()),
    uniqueIndex().using("btree", table.userId.asc().nullsLast()),
    foreignKey({
      columns: [table.documentId],
      foreignColumns: [document.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("set null"),
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
    fields: [file.documentId],
    references: [document.id],
  }),
  User: one(user, {
    fields: [file.userId],
    references: [user.id],
  }),
  StorageProvider: one(pluginService, {
    fields: [file.storageProviderId],
    references: [pluginService.id],
  }),
}));
