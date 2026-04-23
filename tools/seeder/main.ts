// oxlint-disable no-console

import { DrizzleDB, ensureDB } from "@cat/db";
import { loadDevSeed, runSeedPipeline, truncateAllTables } from "@cat/seed";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const skipVectorization = args.includes("--skip-vectorization");
  const outputBindingsIdx = args.indexOf("--output-bindings");
  const outputBindingsPath =
    outputBindingsIdx !== -1 ? args[outputBindingsIdx + 1] : undefined;
  const datasetDir = args.find(
    (a, i) =>
      !a.startsWith("--") &&
      (outputBindingsIdx === -1 || i !== outputBindingsIdx + 1),
  );

  if (!datasetDir) {
    console.error("Usage: tsx main.ts <dataset-dir> [--skip-vectorization] [--output-bindings <path>]");
    console.error("Example: tsx main.ts datasets/default");
    process.exit(1);
  }

  const absoluteDir = resolve(process.cwd(), datasetDir);
  const pluginsDir = resolve(import.meta.dirname, "../../@cat-plugin");
  const cacheDir = resolve(absoluteDir, "../../.vector-cache");
  const defaultPluginsJsonPath = resolve(
    import.meta.dirname,
    "../../apps/app/default-plugins.json",
  );

  // Load .env from apps/app
  try {
    process.loadEnvFile(resolve(import.meta.dirname, "../../apps/app/.env"));
  } catch {
    // ignored if absent
  }

  console.log(`[seed] Loading dataset from: ${absoluteDir}`);

  // 1. Load & validate dataset
  const loadedSeed = loadDevSeed(absoluteDir);
  console.log(
    `[seed] Dataset "${loadedSeed.config.name}" loaded successfully.`,
  );

  const vectorizationEnabled = loadedSeed.config.vectorization.enabled;
  const shouldSkipVectorization = skipVectorization || !vectorizationEnabled;

  // 2. Connect to database
  const drizzleDB = new DrizzleDB();
  await drizzleDB.connect();
  console.log("[seed] Connected to database.");

  // 3. TRUNCATE all tables
  const execCtx = { db: drizzleDB.client };
  console.log("[seed] Truncating all tables...");
  await truncateAllTables(execCtx);
  console.log("[seed] All tables truncated.");

  // 4. Run ensureDB (languages, default settings)
  await ensureDB(drizzleDB);
  console.log("[seed] Base data ensured (languages, settings).");

  // 5. Run seed pipeline
  console.log("[seed] Running seed pipeline...");
  const result = await runSeedPipeline(execCtx, loadedSeed, {
    pluginsDir,
    defaultPluginsJsonPath,
    cacheDir,
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
  console.log(`[seed] Plugins configured: ${result.summary.plugins}`);
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
