import type { SearchRuntimeLevel } from "@cat/domain";

import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

type QueryableDatabase = {
  query: (sql: string) => Promise<unknown>;
  close?: () => Promise<void> | void;
};

/**
 * Result of a single compatibility capability check.
 */
export type CapabilityCheck = {
  /**
   * Name of the capability check.
   */
  name: string;
  /**
   * Outcome status for the capability check.
   */
  status: "available" | "missing" | "blocked";
  /**
   * Optional failure or blocking details.
   */
  details?: string;
};

const FULL_SEARCH_CHECK_NAMES = [
  "pgvector extension",
  "pg_trgm extension",
  "rum extension",
  "zhparser extension",
  "fts parser",
  "rum ranking",
  "hnsw index",
] as const;

const checkDefinitions: ReadonlyArray<readonly [string, string | string[]]> = [
  ["basic sql", "SELECT 1"],
  [
    "transactions",
    ["BEGIN", "CREATE TEMP TABLE cat_pglite_tx(id int)", "ROLLBACK"],
  ],
  [
    "on conflict returning",
    [
      "CREATE TEMP TABLE cat_pglite_upsert(id int primary key, value text)",
      "INSERT INTO cat_pglite_upsert VALUES (1, 'a') ON CONFLICT (id) DO UPDATE SET value = excluded.value RETURNING id",
    ],
  ],
  [
    "skip locked",
    [
      "CREATE TEMP TABLE cat_pglite_queue(id int primary key)",
      "SELECT * FROM cat_pglite_queue FOR UPDATE SKIP LOCKED",
    ],
  ],
  ["pgvector extension", "CREATE EXTENSION IF NOT EXISTS vector"],
  ["pg_trgm extension", "CREATE EXTENSION IF NOT EXISTS pg_trgm"],
  ["rum extension", "CREATE EXTENSION IF NOT EXISTS rum"],
  ["zhparser extension", "CREATE EXTENSION IF NOT EXISTS zhparser"],
  ["fts parser", "SELECT to_tsvector('cat_zh_hans', '你好 world')"],
  [
    "rum ranking",
    "SELECT rum_ts_score(to_tsvector('simple', 'cat'), plainto_tsquery('simple', 'cat'))",
  ],
  [
    "hnsw index",
    [
      "CREATE TEMP TABLE cat_pglite_vec(id int primary key, embedding vector(3))",
      "CREATE INDEX ON cat_pglite_vec USING hnsw (embedding vector_cosine_ops)",
    ],
  ],
];

const isAvailable = (checks: CapabilityCheck[], name: string): boolean => {
  return checks.some(
    (check) => check.name === name && check.status === "available",
  );
};

const isExecutedDirectly = (): boolean => {
  const entryPath = process.argv[1];
  if (!entryPath) return false;
  return fileURLToPath(import.meta.url) === resolve(entryPath);
};

/**
 * Execute one or more SQL statements and convert failures into a compatibility check result.
 *
 * @param db - Database-like object exposing `query()`
 * @param name - Capability check name
 * @param sqlStatements - One or more SQL statements to execute sequentially
 * @returns - Structured capability check result
 */
export const checkSql = async (
  db: QueryableDatabase,
  name: string,
  sqlStatements: string | string[],
): Promise<CapabilityCheck> => {
  try {
    const statements = Array.isArray(sqlStatements)
      ? sqlStatements
      : [sqlStatements];
    for (const statement of statements) {
      await db.query(statement);
    }
    return { name, status: "available" };
  } catch (error) {
    return {
      name,
      status: "missing",
      details: error instanceof Error ? error.message : String(error),
    };
  }
};

/**
 * Derive the search capability level from compatibility check results.
 *
 * @param checks - Completed capability check results
 * @returns - Derived search capability level
 */
export const classifyFromChecks = (
  checks: CapabilityCheck[],
): SearchRuntimeLevel => {
  if (FULL_SEARCH_CHECK_NAMES.every((name) => isAvailable(checks, name))) {
    return "full-search-runtime";
  }
  if (
    isAvailable(checks, "pgvector extension") ||
    isAvailable(checks, "pg_trgm extension")
  ) {
    return "partial-search-runtime";
  }
  return "basic-db-runtime";
};

/**
 * Execute the PGlite compatibility gate and return structured JSON report data.
 *
 * @returns - Report summary containing search capability level and individual check results
 */
export const runPgliteCompatGate = async (): Promise<{
  level: SearchRuntimeLevel;
  checks: CapabilityCheck[];
}> => {
  let PGlite: typeof import("@electric-sql/pglite").PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch (error) {
    return {
      level: "basic-db-runtime",
      checks: [
        {
          name: "pglite package",
          status: "blocked",
          details: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }

  const db = new PGlite() as QueryableDatabase;
  try {
    const checks: CapabilityCheck[] = [];
    for (const [name, sqlStatements] of checkDefinitions) {
      checks.push(await checkSql(db, name, sqlStatements));
    }
    return { level: classifyFromChecks(checks), checks };
  } finally {
    await db.close?.();
  }
};

const main = async (): Promise<void> => {
  const result = await runPgliteCompatGate();
};

if (isExecutedDirectly()) {
  await main();
}
