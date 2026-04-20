import type { FullConfig } from "@playwright/test";

// oxlint-disable no-console -- intentional diagnostic logging in globalSetup
import { DrizzleDB, ensureDB } from "@cat/db";
import { loadDevSeed, runSeedPipeline, truncateAllTables } from "@cat/seed";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const E2E_REFS_PATH = resolve(
  import.meta.dirname,
  "test-results/e2e-refs.json",
);

const validateDatabaseUrl = (): string => {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "[e2e globalSetup] DATABASE_URL is not set. " +
        "Create apps/app-e2e/.env with DATABASE_URL pointing to a database " +
        'whose name contains "e2e" or "test".',
    );
  }

  if (process.env.E2E_SKIP_DB_CHECK === "true") {
    console.log(
      "[e2e globalSetup] E2E_SKIP_DB_CHECK=true — skipping database name validation.",
    );
    return url;
  }

  // Extract database name from URL: postgresql://user:pass@host:port/DBNAME?params
  const dbName = new URL(url).pathname.slice(1).split("?")[0];
  if (!dbName.includes("e2e") && !dbName.includes("test")) {
    throw new Error(
      `[e2e globalSetup] DATABASE_URL database name "${dbName}" does not contain "e2e" or "test". ` +
        "Refusing to run E2E tests against a potential production/development database. " +
        "Set E2E_SKIP_DB_CHECK=true to bypass this check (CI only).",
    );
  }

  return url;
};

/**
 * Warm up the app server before running tests.
 *
 * `onCreateGlobalContext` (Vike) initialises the graph runtime and domain
 * event handlers the first time a Vike page is served. This takes >30 s on a
 * cold DB, which exceeds Vike's built-in timeout and leaves the event bus
 * uninitialised. Warmup triggers `onCreateGlobalContext` early (before table
 * truncation), then polls `/_health` until `globalThis.inited` is true (up to
 * 120 s). Because `onCreateGlobalContext` only runs once per process, the
 * domain event handlers remain registered throughout the entire test run.
 */
const warmupServer = async (baseURL: string): Promise<void> => {
  console.log("[e2e globalSetup] Warming up app server...");

  // Hit a Vike page to trigger onCreateGlobalContext (/_health is a Hono
  // route and does NOT trigger Vike's hook).
  await fetch(`${baseURL}/auth`).catch(() => {
    /* server may not yet be up — ignore */
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const res = await fetch(`${baseURL}/_health`).catch(() => null);
    if (res?.ok) {
      console.log("[e2e globalSetup] Server is ready (/_health returned 200).");
      return;
    }
    await new Promise((r) => setTimeout(r, 2_000));
  }

  throw new Error(
    "[e2e globalSetup] App server did not become ready within 120 s. " +
      "Check the webServer logs for errors.",
  );
};

const globalSetup = async (config: FullConfig): Promise<void> => {
  // 1. Validate DATABASE_URL
  validateDatabaseUrl();

  // 1b. Warm up the server BEFORE truncating tables so that
  //     onCreateGlobalContext (and the domain event handlers it registers) runs
  //     while the DB is still populated from the previous seed run.
  const baseURL =
    config.projects[0]?.use.baseURL ?? "http://localhost:3000";
  await warmupServer(baseURL);

  // 2. Connect to database
  const drizzleDB = new DrizzleDB();
  await drizzleDB.connect();
  console.log("[e2e globalSetup] Connected to database.");

  try {
    const execCtx = { db: drizzleDB.client };

    // 3. Truncate all tables
    console.log("[e2e globalSetup] Truncating all tables...");
    await truncateAllTables(execCtx);

    // 3b. Remove stale auth storage-state files (from a previous DB seed)
    const authDir = resolve(import.meta.dirname, "test-results/.auth");
    await rm(authDir, { recursive: true, force: true });

    // 4. Ensure base data (languages, settings)
    await ensureDB(drizzleDB);
    console.log("[e2e globalSetup] Base data ensured.");

    // 5. Load E2E dataset
    const datasetDir = resolve(
      import.meta.dirname,
      "../../tools/seeder/datasets/e2e",
    );
    const loadedSeed = loadDevSeed(datasetDir);
    console.log(
      `[e2e globalSetup] Dataset "${loadedSeed.config.name}" loaded.`,
    );

    // 6. Run seed pipeline
    const pluginsDir = resolve(import.meta.dirname, "../../@cat-plugin");
    const defaultPluginsJsonPath = resolve(
      import.meta.dirname,
      "../../apps/app/default-plugins.json",
    );
    const cacheDir = resolve(datasetDir, "../../.vector-cache");

    const result = await runSeedPipeline(execCtx, loadedSeed, {
      pluginsDir,
      defaultPluginsJsonPath,
      cacheDir,
      skipVectorization: true,
    });

    console.log(
      `[e2e globalSetup] Seed complete: ${result.summary.users} users, ` +
        `${result.summary.elements} elements, ${result.summary.glossaryConcepts} glossary concepts, ` +
        `${result.summary.memoryItems} memory items.`,
    );

    // 7. Write refs JSON
    const refs: Record<string, string> = {};
    for (const [ref, id] of result.refs.entries()) {
      refs[ref] = String(id);
    }

    await mkdir(resolve(import.meta.dirname, "test-results"), {
      recursive: true,
    });
    await writeFile(E2E_REFS_PATH, JSON.stringify(refs, null, 2), "utf-8");
    console.log(`[e2e globalSetup] Refs written to: ${E2E_REFS_PATH}`);
    console.log("[e2e globalSetup] Refs:", refs);
  } finally {
    await drizzleDB.disconnect();
  }
};

export default globalSetup;
