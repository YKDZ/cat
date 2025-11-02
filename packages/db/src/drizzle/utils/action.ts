import { AnyColumn, SQL, sql } from "drizzle-orm";

export const increment = (column: AnyColumn, value = 1): SQL => {
  return sql`${column} + ${value}`;
};

export const decrement = (column: AnyColumn, value = 1): SQL => {
  return sql`${column} - ${value}`;
};
