/**
 * Safety options for database reset.
 */
export type DatabaseSafetyOptions = {
  /** Explicitly allow an otherwise unsafe target. */
  allowUnsafeReset?: boolean;
  /** Current runtime environment. */
  nodeEnv?: string;
};

const SAFE_DB_NAME_RE =
  /(^|[-_])(dev|test|local|e2e|ci)([-_]|$)|cat_dev|cat_test/i;
const SAFE_HOSTS = new Set([
  "localhost",
  "127.0.0.1",
  "::1",
  "postgres",
  "db",
  "172.17.0.1",
  "host.docker.internal",
]);

/**
 * Determine whether a database URL clearly targets development/test.
 *
 * @param databaseUrl - Database URL
 * @param options - Safety options
 * @returns - Returns void when reset is allowed
 */
export const assertSafeDatabaseTarget = (
  databaseUrl: string | undefined,
  options: DatabaseSafetyOptions = {},
): void => {
  if (
    options.allowUnsafeReset ||
    process.env.CAT_SEED_ALLOW_UNSAFE_RESET === "true"
  ) {
    return;
  }
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required before resetting seed data.");
  }

  const nodeEnv = options.nodeEnv ?? process.env.NODE_ENV ?? "development";
  if (nodeEnv === "production") {
    throw new Error(
      "Refusing to reset database while NODE_ENV=production. Set CAT_SEED_ALLOW_UNSAFE_RESET=true only for intentional disposable targets.",
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error(
      "Refusing to reset database: DATABASE_URL is not a valid URL.",
    );
  }

  const dbName = parsed.pathname.replace(/^\//, "");
  const hostSafe = SAFE_HOSTS.has(parsed.hostname);
  const nameSafe = SAFE_DB_NAME_RE.test(dbName);
  if (!hostSafe && !nameSafe) {
    throw new Error(
      `Refusing to reset database ${parsed.hostname}/${dbName}. Use a dev/test database name or set CAT_SEED_ALLOW_UNSAFE_RESET=true for disposable targets.`,
    );
  }
};
