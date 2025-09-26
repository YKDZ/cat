import { sql } from "drizzle-orm";
import { timestamp, uuid as dbUUID } from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => sql`now()`),
};

export const uuidId = () =>
  dbUUID()
    .primaryKey()
    .default(sql`uuidv7()`)
    .notNull();
