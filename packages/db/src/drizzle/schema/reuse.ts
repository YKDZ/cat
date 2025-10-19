import { HasDefault, IsPrimaryKey, NotNull, sql } from "drizzle-orm";
import {
  timestamp,
  uuid as dbUUID,
  PgUUIDBuilderInitial,
} from "drizzle-orm/pg-core";

export const timestamps = {
  createdAt: timestamp({ withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp({ withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
};

export const uuidId = (): NotNull<
  HasDefault<IsPrimaryKey<NotNull<PgUUIDBuilderInitial<"">>>>
> =>
  dbUUID()
    .primaryKey()
    .default(sql`uuidv7()`)
    .notNull();
