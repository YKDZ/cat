import { Command } from "commander";
// oxlint-disable no-console -- intentional CLI output
// oxlint-disable typescript-eslint/no-unsafe-member-access -- Commander opts are typed as any
// oxlint-disable typescript-eslint/no-unsafe-argument -- Commander opts are typed as any
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { loadSuite } from "@/config";
import { evaluate } from "@/eval";
import { runHarness } from "@/harness";
import { initObservability } from "@/observability";
import { generateReport } from "@/report";

const program = new Command();

program.name("eval").description("CAT evaluation framework").version("0.0.1");

program
  .command("run <suite-dir>")
  .description("Run all test cases in a suite directory")
  .option("--scenario <type>", "Run only scenarios of this type")
  .option("--otlp <endpoint>", "Send traces/metrics to OTLP endpoint")
  .option("--clear-cache", "Clear vector cache before run")
  .option(
    "--plugins-dir <dir>",
    "Plugin build output directory",
    resolveDefaultPluginsDir(),
  )
  .option("-o, --output <file>", "Write JSON results to file")
  .action(async (suiteDir: string, opts) => {
    const absoluteSuiteDir = resolve(process.cwd(), suiteDir);
    const cacheDir = resolve(absoluteSuiteDir, "../../.vector-cache");

    try {
      process.loadEnvFile(resolve(import.meta.dirname, "../../app/.env"));
    } catch {
      // ignored if absent
    }

    if (opts.clearCache) {
      const { VectorCache } = await import("@/seeder/vector-cache");
      new VectorCache(cacheDir).clearAll();
      console.log("[eval] Vector cache cleared.");
    }

    const otel = initObservability({ otlpEndpoint: opts.otlp });

    try {
      const suite = loadSuite(absoluteSuiteDir);
      console.log(
        `[eval] Suite: ${suite.config.name} (${suite.config.scenarios.length} scenarios)`,
      );

      const runResult = await runHarness({
        suite,
        cacheDir,
        pluginsDir: resolve(process.cwd(), opts.pluginsDir),
        scenarioFilter: opts.scenario,
      });

      const scorerNames = suite.config.scenarios.map((s) => s.scorers);
      const evaluation = evaluate(
        runResult.scenarioResults,
        suite.testSets,
        scorerNames,
        runResult.refs,
      );

      const report = generateReport(
        runResult,
        evaluation,
        suite.config.thresholds,
      );

      console.log("\n" + report.markdown);

      if (opts.output) {
        const outPath = resolve(process.cwd(), opts.output);
        writeFileSync(outPath, JSON.stringify(report.json, null, 2));
        console.log(`\n[eval] JSON results written to ${outPath}`);
      }

      await otel.shutdown();
      process.exit(report.allPassed ? 0 : 1);
    } catch (err) {
      await otel.shutdown();
      throw err;
    }
  });

program
  .command("seed <suite-dir>")
  .description("Hydrate DB from seed data only (for debugging)")
  .option(
    "--plugins-dir <dir>",
    "Plugin build output directory",
    resolveDefaultPluginsDir(),
  )
  .action(async (suiteDir: string, opts) => {
    const absoluteSuiteDir = resolve(process.cwd(), suiteDir);
    const cacheDir = resolve(absoluteSuiteDir, "../../.vector-cache");

    try {
      process.loadEnvFile(resolve(import.meta.dirname, "../../app/.env"));
    } catch {
      /* ignored */
    }

    const suite = loadSuite(absoluteSuiteDir);
    const { seed } = await import("@/seeder");
    const ctx = await seed({
      suite,
      cacheDir,
      pluginsDir: resolve(process.cwd(), opts.pluginsDir),
    });

    console.log(`[eval] Seeded suite "${suite.config.name}".`);
    console.log(`[eval] Project ID: ${ctx.projectId}`);
    console.log(`[eval] Refs:`);
    for (const [ref, id] of ctx.refs.entries()) {
      console.log(`  ${ref} → ${id}`);
    }
    console.log("\n[eval] DB is live — press Ctrl+C to cleanup and exit.");

    await new Promise<void>((_, reject) => {
      process.on("SIGINT", () => {
        reject(new Error("interrupted"));
      });
    }).catch(() => {
      // cleanup on SIGINT — error already handled above
    });

    await ctx.cleanup();
    console.log("[eval] Cleanup complete.");
  });

program
  .command("report <results-json>")
  .description("Regenerate human-readable report from raw results")
  .action(async (resultsPath: string) => {
    const { readFileSync } = await import("node:fs");
    const raw = JSON.parse(
      readFileSync(resolve(process.cwd(), resultsPath), "utf-8"),
    );
    const report = generateReport(
      raw,
      raw.evaluation,
      raw.thresholdResults ? undefined : undefined,
    );
    console.log(report.markdown);
  });

program
  .command("env")
  .description("Manage Docker environment")
  .addCommand(
    new Command("up")
      .description("Start Docker Compose services")
      .action(async () => {
        const { execSync } = await import("node:child_process");
        execSync("docker compose up -d", {
          cwd: resolve(import.meta.dirname, ".."),
          stdio: "inherit",
        });
      }),
  )
  .addCommand(
    new Command("down")
      .description("Stop Docker Compose services")
      .action(async () => {
        const { execSync } = await import("node:child_process");
        execSync("docker compose down", {
          cwd: resolve(import.meta.dirname, ".."),
          stdio: "inherit",
        });
      }),
  );

function resolveDefaultPluginsDir(): string {
  return resolve(import.meta.dirname, "../../../@cat-plugin");
}

program.parse();
