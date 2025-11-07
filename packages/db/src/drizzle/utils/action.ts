import { AnyColumn, SQL, sql } from "drizzle-orm";

export const increment = (column: AnyColumn, value = 1): SQL => {
  return sql<number>`(${column} + ${value})`;
};

export const decrement = (column: AnyColumn, value = 1): SQL => {
  return sql<number>`(${column} - ${value})`;
};
