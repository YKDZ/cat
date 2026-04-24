import type { DrizzleClient } from "@cat/domain";

import { sql } from "@cat/db";

const REQUIRED_EXTENSIONS = ["vector", "pg_trgm", "rum", "zhparser"] as const;

export const assertSearchRuntimeHealth = async (
  drizzle: DrizzleClient,
): Promise<void> => {
  const extensionResult = await drizzle.execute(sql`
    SELECT extname
    FROM pg_extension
    WHERE extname IN ('vector', 'pg_trgm', 'rum', 'zhparser')
    ORDER BY extname
  `);
  const installedExtensions = new Set(
    extensionResult.rows
      .map((row) =>
        row && typeof row === "object" && "extname" in row ? row.extname : null,
      )
      .filter((value): value is string => typeof value === "string"),
  );

  const missingExtensions = REQUIRED_EXTENSIONS.filter(
    (extension) => !installedExtensions.has(extension),
  );
  if (missingExtensions.length > 0) {
    throw new Error(
      `Search runtime missing required extensions: ${missingExtensions.join(", ")}`,
    );
  }

  const textSearchConfigResult = await drizzle.execute(sql`
    SELECT cfgname
    FROM pg_ts_config
    WHERE cfgname = 'cat_zh_hans'
  `);
  const hasZhHansConfig = textSearchConfigResult.rows.some(
    (row) =>
      row &&
      typeof row === "object" &&
      "cfgname" in row &&
      row.cfgname === "cat_zh_hans",
  );

  if (!hasZhHansConfig) {
    throw new Error(
      "Search runtime missing required text search config: cat_zh_hans",
    );
  }
};
