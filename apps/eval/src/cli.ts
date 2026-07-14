import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// oxlint-disable no-console -- intentional CLI output
// oxlint-disable typescript-eslint/no-unsafe-member-access -- Commander opts are typed as any
// oxlint-disable typescript-eslint/no-unsafe-argument -- Commander opts are typed as any
import { Command } from "commander";

import { resolveComposeConfig } from "#/compose-config.ts";
import { loadSuite } from "#/config/index.ts";
import { evaluate } from "#/eval/index.ts";
import { runHarness } from "#/harness/index.ts";
import { initObservability } from "#/observability/index.ts";
import { generateReport } from "#/report/index.ts";

const program = new Command();

program.name("eval").description("CAT evaluation framework").version("0.0.1");

program
  .command("run <suite-dir>")
  .description("Run all test cases in a suite directory")
  .option("--scenario <type>", "Run only scenarios of this type")
  .option("--otlp <endpoint>", "Send traces/metrics to OTLP endpoint")
  .option(
    "--otlp-headers <headers>",
    "Headers for OTLP endpoint (comma-separated key=value pairs)",
  )
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
      const { VectorCache } = await import("#/seeder/vector-cache.ts");
      new VectorCache(cacheDir).clearAll();
      console.log("[eval] Vector cache cleared.");
    }

    const otlpHeaders = parseHeaders(opts.otlpHeaders);
    const otel = initObservability({
      otlpEndpoint: opts.otlp,
      ...(otlpHeaders === undefined ? {} : { otlpHeaders }),
    });

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
    const { seed } = await import("#/seeder/index.ts");
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
      .option("--suite <name>", "Start environment for a specific suite")
      .action(async (opts) => {
        const { execFileSync } = await import("node:child_process");
        const { composeArgs, composeCwd } = resolveComposeConfig(opts.suite);
        execFileSync("docker", ["compose", ...composeArgs, "up", "-d"], {
          cwd: composeCwd,
          stdio: "inherit",
        });
      }),
  )
  .addCommand(
    new Command("down")
      .description("Stop Docker Compose services")
      .option("--suite <name>", "Stop environment for a specific suite")
      .action(async (opts) => {
        const { execFileSync } = await import("node:child_process");
        const { composeArgs, composeCwd } = resolveComposeConfig(opts.suite);
        execFileSync("docker", ["compose", ...composeArgs, "down"], {
          cwd: composeCwd,
          stdio: "inherit",
        });
      }),
  );

function resolveDefaultPluginsDir(): string {
  return resolve(import.meta.dirname, "../../../@cat-plugin");
}

function parseHeaders(
  raw: string | undefined,
): Record<string, string> | undefined {
  if (!raw) return undefined;
  const headers: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) headers[key] = value;
  }
  return Object.keys(headers).length > 0 ? headers : undefined;
}

program.parse();
