import { sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

export const increment = <T extends PgColumn>(
  column: T,
  amount: number = 1,
): T => {
  // oxlint-disable-next-line no-unsafe-type-assertion
  return sql`${column} + ${amount}` as unknown as T;
};

export const decrement = <T extends PgColumn>(
  column: T,
  amount: number = 1,
): T => {
  // oxlint-disable-next-line no-unsafe-type-assertion
  return sql`${column} - ${amount}` as unknown as T;
};
