import type { ExecutorContext } from "@cat/domain";

import { sql } from "@cat/db";

/**
 * TRUNCATE all application tables with CASCADE.
 * Preserves table structure and enum types — only data is cleared.
 *
 * We query pg_tables to get all tables in the current schema,
 * then TRUNCATE them all at once. This avoids hardcoding table names
 * and automatically adapts to schema changes.
 */
export const truncateAllTables = async (
  execCtx: ExecutorContext,
): Promise<void> => {
  const result = await execCtx.db.execute(sql`
    SELECT string_agg('"' || tablename || '"', ', ') AS tables
    FROM pg_tables
    WHERE schemaname = current_schema()
      AND tablename NOT LIKE '__drizzle%'
      AND tablename NOT LIKE 'drizzle%'
  `);

  const firstRow: unknown = result.rows?.[0];
  if (
    firstRow === null ||
    typeof firstRow !== "object" ||
    !("tables" in firstRow)
  )
    return;
  const { tables } = firstRow as Record<string, unknown>;
  if (typeof tables !== "string") return;
  const tableList = tables;

  await execCtx.db.execute(sql.raw(`TRUNCATE TABLE ${tableList} CASCADE`));
};
