import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { SearchRuntimeLevel } from "@cat/domain";

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

export type PgliteGateReport = {
  level: SearchRuntimeLevel;
  passed: boolean;
  checks: CapabilityCheck[];
  failures: CapabilityCheck[];
  expectedUnsupported: Array<
    CapabilityCheck & {
      reason: string;
    }
  >;
};

const REQUIRED_CHECK_NAMES = [
  "pglite package",
  "basic sql",
  "transactions",
  "on conflict returning",
  "skip locked",
] as const;

const FULL_SEARCH_CHECK_NAMES = [
  "pgvector extension",
  "pg_trgm extension",
  "rum extension",
  "zhparser extension",
  "fts parser",
  "rum ranking",
  "hnsw index",
] as const;

const EXPECTED_UNSUPPORTED_REASONS = new Map<string, string>([
  [
    "pgvector extension",
    "PGlite core does not bundle CAT's native pgvector extension runtime.",
  ],
  [
    "pg_trgm extension",
    "PGlite core does not guarantee CAT's native pg_trgm extension runtime.",
  ],
  ["rum extension", "PGlite does not bundle CAT's native RUM extension."],
  [
    "zhparser extension",
    "PGlite does not bundle CAT's native zhparser extension.",
  ],
  [
    "fts parser",
    "CAT's cat_zh_hans text-search configuration depends on zhparser.",
  ],
  ["rum ranking", "CAT's RUM ranking function depends on the RUM extension."],
  ["hnsw index", "CAT's HNSW operator class depends on pgvector."],
]);

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

export const evaluatePgliteGate = (
  checks: CapabilityCheck[],
): PgliteGateReport => {
  const failures = checks.filter(
    (check) =>
      check.status !== "available" &&
      !EXPECTED_UNSUPPORTED_REASONS.has(check.name),
  );
  for (const name of REQUIRED_CHECK_NAMES) {
    if (checks.some((check) => check.name === name)) continue;
    failures.push({
      name,
      status: "blocked",
      details: "Required probe did not run.",
    });
  }
  const expectedUnsupported = checks.flatMap((check) => {
    const reason = EXPECTED_UNSUPPORTED_REASONS.get(check.name);
    return check.status === "missing" && reason !== undefined
      ? [{ ...check, reason }]
      : [];
  });

  return {
    level: classifyFromChecks(checks),
    passed: failures.length === 0,
    checks,
    failures,
    expectedUnsupported,
  };
};

export const pgliteGateExitCode = (report: PgliteGateReport): 0 | 1 =>
  report.passed ? 0 : 1;

export const formatPgliteGateSuccess = (report: PgliteGateReport): string =>
  `pglite compatibility passed level=${report.level} checks=${report.checks.length} expected-unsupported=${report.expectedUnsupported.length}`;

export const formatPgliteGateFailure = (report: PgliteGateReport): string =>
  [
    `pglite compatibility failed level=${report.level} failures=${report.failures.length}`,
    ...report.failures.map(
      (failure) => `${failure.name}: ${failure.details ?? failure.status}`,
    ),
  ].join("\n");

/**
 * Execute the PGlite compatibility gate and return structured probe data.
 *
 * @returns - Report summary containing search capability level and individual check results
 */
export const runPgliteCompatGate = async (): Promise<PgliteGateReport> => {
  let PGlite: typeof import("@electric-sql/pglite").PGlite;
  try {
    ({ PGlite } = await import("@electric-sql/pglite"));
  } catch (error) {
    return evaluatePgliteGate([
      {
        name: "pglite package",
        status: "blocked",
        details: error instanceof Error ? error.message : String(error),
      },
    ]);
  }

  const db = new PGlite() as QueryableDatabase;
  try {
    const checks: CapabilityCheck[] = [
      { name: "pglite package", status: "available" },
    ];
    for (const [name, sqlStatements] of checkDefinitions) {
      checks.push(await checkSql(db, name, sqlStatements));
    }
    return evaluatePgliteGate(checks);
  } finally {
    await db.close?.();
  }
};

const main = async (): Promise<void> => {
  const report = await runPgliteCompatGate();
  if (report.passed) {
    process.stdout.write(`${formatPgliteGateSuccess(report)}\n`);
    return;
  }
  process.stderr.write(`${formatPgliteGateFailure(report)}\n`);
  process.exitCode = 1;
};

if (isExecutedDirectly()) {
  await main();
}
