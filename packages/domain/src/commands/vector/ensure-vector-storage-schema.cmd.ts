import { sql } from "@cat/db";
import { RequiredVectorDimension } from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const EnsureVectorStorageSchemaCommandSchema = z.object({
  dimension: z.literal(RequiredVectorDimension),
});

export type EnsureVectorStorageSchemaCommand = z.infer<
  typeof EnsureVectorStorageSchemaCommandSchema
>;

export const ensureVectorStorageSchema: Command<
  EnsureVectorStorageSchemaCommand
> = async (ctx, command) => {
  EnsureVectorStorageSchemaCommandSchema.parse(command);
  // Schema preparation owns all vector DDL. Runtime can only attest it.
  const result = await ctx.db.execute<{ typmod: number }>(sql`
    SELECT a.atttypmod AS typmod
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = current_schema()
      AND c.relname = 'Vector'
      AND c.relkind = 'r'
      AND a.attname = 'vector'
      AND a.attnum > 0
  `);

  const currentDimension = result.rows.at(0)?.typmod;
  if (currentDimension === undefined) {
    throw new Error(
      "Vector schema is missing. Run schema preparation before starting CAT.",
    );
  }
  if (currentDimension !== RequiredVectorDimension) {
    throw new Error(
      `Vector schema dimension ${currentDimension} does not match the fixed vector dimension ${RequiredVectorDimension}. CAT requires a prepared vector(${RequiredVectorDimension}) schema and a vectorizer configured to output ${RequiredVectorDimension} dimensions.`,
    );
  }

  return {
    result: undefined,
    events: [],
  };
};
