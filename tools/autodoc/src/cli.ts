#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";

import { buildIndex, loadIndex, saveIndex, findSymbols } from "./ir-index.js";
import { createLlmsTxtRenderer } from "./renderer/llms-txt-renderer.js";
import { createOverviewRenderer } from "./renderer/overview-renderer.js";
import { createPackageRenderer } from "./renderer/package-renderer.js";
import { createPackageScanner } from "./scanner/package-scanner.js";
import { AutodocConfigSchema } from "./types.js";

const loadConfig = async (args: string[] = []) => {
  const { values } = parseArgs({
    args,
    options: {
      config: {
        type: "string",
        short: "c",
        default: "autodoc.config.ts",
      },
      output: { type: "string", short: "o" },
    },
    strict: false,
  });

  // Nx sets NX_WORKSPACE_ROOT to the monorepo root; fall back to cwd for standalone use
  const wsRoot = process.env.NX_WORKSPACE_ROOT ?? process.cwd();

  const configPath = resolve(
    wsRoot,
    typeof values.config === "string" ? values.config : "autodoc.config.ts",
  );
  const configModule: { default: unknown } = await import(configPath);
  const config = AutodocConfigSchema.parse(configModule.default);

  // Resolve all relative paths against workspace root
  config.output.path = resolve(wsRoot, config.output.path);
  config.packages = config.packages.map((pkg) => ({
    ...pkg,
    path: resolve(wsRoot, pkg.path),
  }));

  // Override output path if provided via CLI arg
  if (typeof values.output === "string") {
    config.output.path = resolve(wsRoot, values.output);
  }

  return config;
};

const runGenerate = async (args: string[]): Promise<void> => {
  const config = await loadConfig(args);
  const outputDir = config.output.path;
  await mkdir(join(outputDir, "packages"), { recursive: true });

  // 1. Scan → PackageIR[]
  console.log("Scanning packages...");
  const scanner = createPackageScanner(config);
  const packages = await scanner.scanAll();

  // 2. Render overview (remark AST)
  const overviewRenderer = createOverviewRenderer(config);
  await writeFile(
    join(outputDir, "overview.md"),
    overviewRenderer.render(packages),
  );

  // 3. Render per-package docs (remark AST, TS signature)
  const pkgRenderer = createPackageRenderer();
  await Promise.all(
    packages.map(async (pkg) => {
      const isHighPriority =
        config.packages.find((p) => p.name === pkg.name)?.priority === "high";
      const content = pkgRenderer.renderPackage(pkg, {
        detailed: isHighPriority ?? false,
      });
      const shortName = pkg.name.replace("@cat/", "");
      await writeFile(join(outputDir, "packages", `${shortName}.md`), content);
    }),
  );

  // 4. Render llms.txt
  if (config.llmsTxt.enabled) {
    const llmsRenderer = createLlmsTxtRenderer();
    await writeFile(join(outputDir, "llms.txt"), llmsRenderer.render(packages));
  }

  // 5. Save symbol index
  const index = buildIndex(packages);
  await saveIndex(index, join(outputDir, ".symbol-index.json"));

  console.log(
    `Documentation generated in ${outputDir} (${packages.length} packages, ${index.length} symbols)`,
  );
};

const runCheck = async (args: string[]): Promise<void> => {
  const config = await loadConfig(args);

  console.log("Scanning packages...");
  const scanner = createPackageScanner(config);
  const packages = await scanner.scanAll();

  const overviewRenderer = createOverviewRenderer(config);
  const pkgRenderer = createPackageRenderer();
  const llmsRenderer = createLlmsTxtRenderer();

  const tmpDir = await mkdtemp(join(tmpdir(), "autodoc-check-"));
  try {
    await mkdir(join(tmpDir, "packages"), { recursive: true });

    const overviewContent = overviewRenderer.render(packages);
    await writeFile(join(tmpDir, "overview.md"), overviewContent);

    if (config.llmsTxt.enabled) {
      const llmsContent = llmsRenderer.render(packages);
      await writeFile(join(tmpDir, "llms.txt"), llmsContent);
    }

    await Promise.all(
      packages.map(async (pkg) => {
        const isHighPriority =
          config.packages.find((p) => p.name === pkg.name)?.priority === "high";
        const pkgContent = pkgRenderer.renderPackage(pkg, {
          detailed: isHighPriority ?? false,
        });
        const shortName = pkg.name.replace("@cat/", "");
        await writeFile(
          join(tmpDir, "packages", `${shortName}.md`),
          pkgContent,
        );
      }),
    );

    // Also write temp index for comparison
    const index = buildIndex(packages);
    await saveIndex(index, join(tmpDir, ".symbol-index.json"));

    // Compare generated files against existing
    const outputDir = config.output.path;
    let outdated = false;

    const checkFile = (relativePath: string) => {
      const existing = join(outputDir, relativePath);
      const generated = join(tmpDir, relativePath);
      if (!existsSync(existing)) {
        console.error(`Missing file: ${existing}`);
        outdated = true;
        return;
      }
      const existingContent = readFileSync(existing, "utf-8");
      const generatedContent = readFileSync(generated, "utf-8");
      if (existingContent !== generatedContent) {
        console.error(`Outdated: ${existing}`);
        outdated = true;
      }
    };

    checkFile("overview.md");
    if (config.llmsTxt.enabled) checkFile("llms.txt");
    checkFile(".symbol-index.json");
    for (const pkg of packages) {
      const shortName = pkg.name.replace("@cat/", "");
      checkFile(`packages/${shortName}.md`);
    }

    if (outdated) {
      console.error(
        "\nDocumentation is outdated. Run 'pnpm autodoc' and commit.",
      );
      process.exit(1);
    } else {
      console.log("Documentation is up-to-date.");
    }
  } finally {
    await rm(tmpDir, { recursive: true });
  }
};

const runLookup = async (args: string[]): Promise<void> => {
  const { positionals } = parseArgs({
    args,
    options: {
      config: { type: "string", short: "c" },
      output: { type: "string", short: "o" },
    },
    strict: false,
    allowPositionals: true,
  });

  if (positionals.length === 0) {
    console.error("Usage: autodoc lookup <symbol-id-or-name> [...]");
    process.exit(1);
  }

  const config = await loadConfig(args);
  const indexPath = join(config.output.path, ".symbol-index.json");

  if (!existsSync(indexPath)) {
    console.error(
      `Symbol index not found at ${indexPath}. Run 'pnpm autodoc' first.`,
    );
    process.exit(1);
  }

  const entries = await loadIndex(indexPath);

  let hasResults = false;
  for (const query of positionals) {
    const results = findSymbols(entries, query);
    if (results.length === 0) {
      console.log(`No symbols found matching "${query}"`);
      continue;
    }
    hasResults = true;
    for (const entry of results) {
      console.log(entry.id);
      console.log(`  File: ${entry.filePath}:${entry.line}-${entry.endLine}`);
      console.log(`  Kind: ${entry.kind}`);
      console.log(`  Package: ${entry.packageName}`);
      if (entry.description) console.log(`  Description: ${entry.description}`);
      console.log();
    }
  }

  if (!hasResults) {
    process.exit(1);
  }
};

const main = async () => {
  const args = process.argv.slice(2);
  const subcommand = args[0];

  switch (subcommand) {
    case "check":
      await runCheck(args.slice(1));
      break;
    case "lookup":
      await runLookup(args.slice(1));
      break;
    default:
      await runGenerate(args);
  }
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
