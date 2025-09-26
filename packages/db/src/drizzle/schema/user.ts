import {
  boolean,
  foreignKey,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { timestamps, uuidId } from "../utils/reuse.ts";
import { file } from "./file.ts";
import { document, translatableElement } from "./document.ts";
import { project } from "./project.ts";
import {
  translation,
  translationApprovement,
  translationVote,
} from "./translation.ts";
import { memory, memoryItem } from "./memory.ts";
import { glossary, term } from "./glossary.ts";
import { pluginConfigInstance } from "./plugin.ts";

export const user = pgTable(
  "User",
  {
    id: uuidId(),
    name: text().notNull(),
    email: text().notNull(),
    emailVerified: boolean().default(false).notNull(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using("btree", table.email.asc().nullsLast().op("text_ops")),
    uniqueIndex().using("btree", table.name.asc().nullsLast().op("text_ops")),
  ],
);

export const account = pgTable(
  "Account",
  {
    type: text().notNull(),
    provider: text().notNull(),
    providedAccountId: text().notNull(),
    userId: uuid().notNull(),
    meta: jsonb(),
    ...timestamps,
  },
  (table) => [
    uniqueIndex().using(
      "btree",
      table.userId.asc().nullsLast(),
      table.provider.asc().nullsLast().op("text_ops"),
    ),
    foreignKey({
      columns: [table.userId],
      foreignColumns: [user.id],
    })
      .onUpdate("cascade")
      .onDelete("cascade"),
    primaryKey({
      columns: [table.provider, table.providedAccountId],
    }),
  ],
);

export const userRelations = relations(user, ({ one, many }) => ({
  AvatarFile: one(file),
  Documents: many(document),
  Projects: many(project),
  Translations: many(translation),
  Glossaries: many(glossary),
  Terms: many(term),
  Memories: many(memory),
  TranslatableElements: many(translatableElement),
  TranslationVotes: many(translationVote),
  MemoryItems: many(memoryItem),
  TranslationApprovements: many(translationApprovement),
  PluginConfigInstances: many(pluginConfigInstance),
  Accounts: many(account),
}));

export const accountRelations = relations(account, ({ one }) => ({
  User: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));
