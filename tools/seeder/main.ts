import { DrizzleDB, RedisConnection, ensureDB, sql } from "@cat/db";
import {
  BuiltinPluginLoader,
  CompositePluginLoader,
  FileSystemPluginLoader,
} from "@cat/plugin-core";
import {
  assertSafeDatabaseTarget,
  loadDevSeed,
  runSeedPipeline,
  truncateAllTables,
} from "@cat/seed";
import {
  defaultProductPluginIds,
  systemPgVectorEntry,
} from "@cat/server-shared";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const collectOptionValueIndexes = (
  args: string[],
  optionName: string,
  indexes: Set<number>,
): void => {
  for (const [index, arg] of args.entries()) {
    if (arg !== optionName) continue;
    indexes.add(index + 1);
  }
};

const optionValues = (args: string[], optionName: string): string[] => {
  const values: string[] = [];
  for (const [index, arg] of args.entries()) {
    if (arg !== optionName) continue;
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${optionName}`);
    }
    values.push(value);
  }
  return values;
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const allowUnsafeReset =
    args.includes("--allow-unsafe-reset") ||
    args.includes("--yes-i-know-this-will-reset-db");
  const skipVectorization = args.includes("--skip-vectorization");
  const noLocalOverrides = args.includes("--no-local-overrides");
  const outputBindingsIdx = args.indexOf("--output-bindings");
  const outputBindingsPath =
    outputBindingsIdx !== -1 ? args[outputBindingsIdx + 1] : undefined;
  const localOverridePaths = optionValues(args, "--local-overrides");
  const valueIndexes = new Set<number>();
  collectOptionValueIndexes(args, "--output-bindings", valueIndexes);
  collectOptionValueIndexes(args, "--local-overrides", valueIndexes);
  const datasetDir = args.find(
    (a, i) => !a.startsWith("--") && !valueIndexes.has(i),
  );

  if (!datasetDir) {
    console.error(
      "Usage: tsx main.ts <dataset-dir> [--skip-vectorization] [--allow-unsafe-reset] [--output-bindings <path>] [--local-overrides <path>] [--no-local-overrides]",
    );
    console.error("Example: tsx main.ts datasets/default");
    process.exit(1);
  }

  const absoluteDir = resolve(process.cwd(), datasetDir);
  const pluginsDir = resolve(import.meta.dirname, "../../@cat-plugin");
  const cacheDir = resolve(absoluteDir, "../../.vector-cache");
  const pluginLoader = new CompositePluginLoader([
    new BuiltinPluginLoader([systemPgVectorEntry]),
    new FileSystemPluginLoader(pluginsDir),
  ]);

  // Load .env from apps/app
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../apps/app/.env"));
  } catch {
    // ignored if absent
  }

  console.log(`[seed] Loading dataset from: ${absoluteDir}`);

  // 1. Load & validate dataset
  const discoveredLocalOverridePaths = noLocalOverrides
    ? []
    : [
        resolve(import.meta.dirname, "local/seed.yaml"),
        resolve(absoluteDir, "seed.local.yaml"),
      ];
  const loadedSeed = loadDevSeed(absoluteDir, {
    localOverridePaths: [
      ...discoveredLocalOverridePaths,
      ...localOverridePaths.map((path) => resolve(process.cwd(), path)),
    ],
  });
  console.log(
    `[seed] Dataset "${loadedSeed.config.name}" loaded successfully.`,
  );
  if (loadedSeed.localOverrideSources.length > 0) {
    console.log("[seed] Local overrides loaded:");
    for (const source of loadedSeed.localOverrideSources) {
      console.log(
        `  ${source.path} (${source.pluginOverrideCount} plugin overrides)`,
      );
    }
  }

  const hasVectorizerConfigured = loadedSeed.config.plugins.overrides.some(
    (o) => o.plugin === "openai-vectorizer" || o.plugin.includes("vectorizer"),
  );
  const shouldSkipVectorization = skipVectorization || !hasVectorizerConfigured;

  if (skipVectorization) {
    console.log("[seed] Vectorization: skipped (--skip-vectorization flag).");
  } else if (hasVectorizerConfigured) {
    console.log(
      "[seed] Vectorization: enabled (vectorizer plugin configured; use --skip-vectorization to skip).",
    );
  } else {
    console.log(
      "[seed] Vectorization: auto-skipped (no vectorizer plugin configured).",
    );
  }

  // 2. Connect to database
  const drizzleDB = new DrizzleDB();
  await drizzleDB.connect();
  console.log("[seed] Connected to database.");

  // 3. TRUNCATE all tables
  const execCtx = { db: drizzleDB.client };
  assertSafeDatabaseTarget(process.env.DATABASE_URL, { allowUnsafeReset });
  console.log("[seed] Truncating all tables...");
  await truncateAllTables(execCtx);
  console.log("[seed] All tables truncated.");

  // Flush vectorization queue to prevent stale tasks from blocking next app start
  await drizzleDB.client
    .execute(
      sql`
        DELETE FROM "RuntimeQueueTask" WHERE queue_name = 'vectorization'
      `,
    )
    .then(() => {
      console.log("[seed] PostgreSQL vectorization queue flushed.");
    })
    .catch(() => undefined);

  if (process.env.REDIS_URL) {
    const redisConn = new RedisConnection();
    try {
      await redisConn.connect();
      await redisConn.redis.del("queue:vectorization:pending");
      await redisConn.redis.del("queue:vectorization:processing");
      console.log("[seed] Redis vectorization queue flushed.");
    } finally {
      redisConn.disconnect();
    }
  }

  // 4. Run ensureDB (languages, default settings)
  await ensureDB(drizzleDB);
  console.log("[seed] Base data ensured (languages, settings).");

  // 5. Run seed pipeline
  console.log("[seed] Running seed pipeline...");
  const result = await runSeedPipeline(execCtx, loadedSeed, {
    pluginsDir,
    defaultPluginIds: [...defaultProductPluginIds],
    cacheDir,
    pluginLoader,
    skipVectorization: shouldSkipVectorization,
  });

  // 6. Print summary
  console.log("\n[seed] ═══════════════════════════════════════");
  console.log(`[seed] Dataset: ${loadedSeed.config.name}`);
  console.log(`[seed] Users created: ${result.summary.users}`);
  console.log(`[seed] Projects created: ${result.summary.projects}`);
  console.log(`[seed] Glossary concepts: ${result.summary.glossaryConcepts}`);
  console.log(`[seed] Memory items: ${result.summary.memoryItems}`);
  console.log(`[seed] Elements: ${result.summary.elements}`);
  console.log(`[seed] Bootstrap elements: ${result.summary.bootstrapElements}`);
  console.log(
    `[seed] Bootstrap locale memory items: ${result.summary.bootstrapLocaleMemoryItems}`,
  );
  console.log(`[seed] Plugins configured: ${result.summary.plugins}`);
  if (result.bootstrapReportPath) {
    console.log(`[seed] Bootstrap report: ${result.bootstrapReportPath}`);
  }
  console.log("[seed] ═══════════════════════════════════════");
  console.log("\n[seed] Refs:");
  for (const [ref, id] of result.refs.entries()) {
    console.log(`  ${ref} → ${id}`);
  }
  console.log("\n[seed] Done.");

  // Write bindings JSON file if --output-bindings was specified
  if (outputBindingsPath) {
    const bindings: Record<string, string> = {};
    for (const [ref, id] of result.refs.entries()) {
      bindings[ref] = String(id);
    }
    const absPath = resolve(process.cwd(), outputBindingsPath);
    await writeFile(absPath, JSON.stringify(bindings, null, 2), "utf-8");
    console.log(`[seed] Bindings written to: ${absPath}`);
  }

  // 7. Cleanup connections
  await drizzleDB.disconnect();
  process.exit(0);
};

main().catch((err: unknown) => {
  console.error("[seed] Fatal error:", err);
  process.exit(1);
});
