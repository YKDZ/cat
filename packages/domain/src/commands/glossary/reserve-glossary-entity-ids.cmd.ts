import { sql } from "@cat/db";
import * as z from "zod";

import type { Command, DbHandle } from "#/types.ts";

export const ReserveGlossaryEntityIdsCommandSchema = z.strictObject({
  conceptCount: z.int().nonnegative(),
  termCount: z.int().nonnegative(),
});

export type ReserveGlossaryEntityIdsCommand = z.infer<
  typeof ReserveGlossaryEntityIdsCommandSchema
>;

export type ReserveGlossaryEntityIdsResult = {
  conceptIds: number[];
  termIds: number[];
};

const reserveIds = async (
  db: DbHandle,
  tableName: "Term" | "TermConcept",
  count: number,
): Promise<number[]> => {
  if (count === 0) return [];
  const result = await db.execute<{ id: number }>(sql`
    SELECT nextval(
      pg_get_serial_sequence(
        format('%I.%I', current_schema(), ${tableName}::text),
        'id'
      )
    )::integer AS id
    FROM generate_series(1, ${count})
    ORDER BY 1
  `);
  return result.rows.map((row) => row.id);
};

/**
 * Reserves primary keys for branch-isolated Glossary snapshots. The resulting
 * gaps are intentional: canonical rows and recall demand are created only when
 * the changeset is applied.
 */
export const reserveGlossaryEntityIds: Command<
  ReserveGlossaryEntityIdsCommand,
  ReserveGlossaryEntityIdsResult
> = async (ctx, command) => {
  const input = ReserveGlossaryEntityIdsCommandSchema.parse(command);
  const conceptIds = await reserveIds(
    ctx.db,
    "TermConcept",
    input.conceptCount,
  );
  const termIds = await reserveIds(ctx.db, "Term", input.termCount);
  return { result: { conceptIds, termIds }, events: [] };
};
