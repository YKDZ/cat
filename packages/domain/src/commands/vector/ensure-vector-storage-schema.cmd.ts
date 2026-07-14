import { sql } from "@cat/db";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const EnsureVectorStorageSchemaCommandSchema = z.object({
  dimension: z.int().min(1),
});

export type EnsureVectorStorageSchemaCommand = z.infer<
  typeof EnsureVectorStorageSchemaCommandSchema
>;

export const ensureVectorStorageSchema: Command<
  EnsureVectorStorageSchemaCommand
> = async (ctx, command) => {
  // Schema preparation owns all vector DDL. Runtime can only attest it.
  const result = await ctx.db.execute<{ typmod: number }>(sql`
    SELECT a.atttypmod AS typmod
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    WHERE c.relname = 'Vector'
      AND a.attname = 'vector'
      AND a.attnum > 0
  `);

  const currentDimension = result.rows.at(0)?.typmod;
  if (currentDimension === undefined) {
    throw new Error(
      "Vector schema is missing. Run schema preparation before starting CAT.",
    );
  }
  if (currentDimension !== command.dimension) {
    throw new Error(
      `Vector schema dimension ${currentDimension} does not match required dimension ${command.dimension}. Re-run schema preparation with the configured dimension.`,
    );
  }

  return {
    result: undefined,
    events: [],
  };
};
