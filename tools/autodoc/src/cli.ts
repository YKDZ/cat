#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import type { AutodocConfig } from "./types.js";

import { buildAgentCatalog } from "./assembler/agent-catalog.js";
import { buildCompatProjections } from "./assembler/compat-projections.js";
import { buildAllPairedPages } from "./assembler/paired-pages.js";
import { buildAllSectionIndexes } from "./assembler/subject-index.js";
import { loadIndex, saveIndex, findSymbols } from "./ir-index.js";
import { buildReferenceCatalog } from "./reference/compiler.js";
import { createPackageScanner } from "./scanner/package-scanner.js";
import { buildSemanticCatalog } from "./semantic/compiler.js";
import { collectFragments } from "./semantic/fragment-collector.js";
import { AutodocConfigSchema } from "./types.js";
import { formatFindings, hasErrors } from "./validation/findings.js";
import { runValidation } from "./validation/run.js";

// ── Config loading ─────────────────────────────────────────────────────────────

const findFileUpwards = (
  startDir: string,
  fileName: string,
): string | undefined => {
  let currentDir = resolve(startDir);

  while (true) {
    const candidate = join(currentDir, fileName);
    if (existsSync(candidate)) {
      return candidate;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
};

const resolveWorkspaceConfig = (
  configArg: string,
): { configPath: string; workspaceRoot: string } => {
  if (isAbsolute(configArg)) {
    const configPath = resolve(configArg);
    if (!existsSync(configPath)) {
      throw new Error(`Autodoc config not found: ${configPath}`);
    }
    return { configPath, workspaceRoot: dirname(configPath) };
  }

  const candidateStarts = [
    process.env.MOON_WORKSPACE_ROOT,
    process.cwd(),
  ].filter((value): value is string => typeof value === "string");

  const seen = new Set<string>();
  for (const start of candidateStarts) {
    if (seen.has(start)) {
      continue;
    }
    seen.add(start);

    const found = findFileUpwards(start, configArg);
    if (found) {
      return { configPath: found, workspaceRoot: dirname(found) };
    }
  }

  throw new Error(
    `Autodoc config not found: ${configArg}. Tried resolving from ${candidateStarts.join(", ")}`,
  );
};

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

  const configArg =
    typeof values.config === "string" ? values.config : "autodoc.config.ts";
  const { configPath, workspaceRoot: wsRoot } =
    resolveWorkspaceConfig(configArg);

  // Keep scanner/extractor behavior consistent even when launched from nested project cwd.
  process.env.MOON_WORKSPACE_ROOT ??= wsRoot;

  const configModule: { default: unknown } = await import(
    pathToFileURL(configPath).href
  );
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

  return { config, workspaceRoot: wsRoot };
};

// ── Build pipeline helpers ─────────────────────────────────────────────────────

const buildCompileChain = async (
  config: AutodocConfig,
  workspaceRoot: string,
) => {
  console.log("Scanning packages...");
  const scanner = createPackageScanner(config);
  const packages = await scanner.scanAll();
  const referenceCatalog = buildReferenceCatalog(packages);

  console.log("Collecting semantic fragments...");
  const fragments = await collectFragments({
    workspaceRoot,
    readmeGlobs: ["packages/*/README.md", "apps/*/README.md"],
    semanticMdGlobs: config.fragments ?? [],
  });
  const { catalog: semanticCatalog, findings: semanticFindings } =
    buildSemanticCatalog(fragments, null, referenceCatalog);

  return { referenceCatalog, semanticCatalog, semanticFindings };
};

const writeOutputFiles = async (
  config: AutodocConfig,
  workspaceRoot: string,
  outputDir: string,
  registry: import("./subjects/registry.js").SubjectRegistry | null,
  sections: import("./subjects/ir.js").SectionIR[] | null,
  referenceCatalog: import("./reference/compiler.js").ReferenceCatalog,
  semanticCatalog: import("./semantic/ir.js").SemanticCatalog,
) => {
  // Compat projections
  const compat = buildCompatProjections(config, referenceCatalog);
  await mkdir(join(outputDir, "packages"), { recursive: true });
  await writeFile(join(outputDir, "overview.md"), compat.overviewMd);
  if (compat.llmsTxt !== null) {
    await writeFile(join(outputDir, "llms.txt"), compat.llmsTxt);
  }
  await Promise.all(
    Array.from(compat.packagePages, async ([shortName, content]) =>
      writeFile(join(outputDir, "packages", `${shortName}.md`), content),
    ),
  );
  await saveIndex(compat.symbolIndex, join(outputDir, ".symbol-index.json"));

  // 2.0 outputs — only if registry + sections available
  if (registry && sections) {
    // Section indexes
    const sectionIndexes = buildAllSectionIndexes(sections, registry.subjects);
    await Promise.all(
      Array.from(sectionIndexes, async ([sectionId, content]) => {
        await mkdir(join(outputDir, sectionId), { recursive: true });
        await writeFile(join(outputDir, sectionId, "index.md"), content);
      }),
    );

    // Paired pages
    const pairedPages = buildAllPairedPages(
      registry.subjects,
      semanticCatalog,
      referenceCatalog,
    );
    await Promise.all(
      pairedPages.map(async (page) => {
        const dir = join(outputDir, dirname(page.basePath));
        await mkdir(dir, { recursive: true });
        await Promise.all([
          writeFile(
            join(outputDir, `${page.basePath}.zh.md`),
            page.zhContent,
          ),
          writeFile(
            join(outputDir, `${page.basePath}.en.md`),
            page.enContent,
          ),
        ]);
      }),
    );

    // Agent catalog
    await mkdir(join(outputDir, "agent"), { recursive: true });
    const agentCatalog = buildAgentCatalog(
      registry.subjects,
      sections,
      semanticCatalog,
      referenceCatalog,
    );
    await writeFile(
      join(outputDir, "agent", "subjects.json"),
      agentCatalog.subjectsJson,
    );
    await writeFile(
      join(outputDir, "agent", "references.json"),
      agentCatalog.referencesJson,
    );
  }
};

// ── Collect existing output paths ─────────────────────────────────────────────

const collectOutputPaths = (outputDir: string): Set<string> => {
  const paths = new Set<string>();
  if (!existsSync(outputDir)) return paths;

  const walkDir = (dir: string) => {
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = join(dir, entry.name);
        const rel = relative(outputDir, full);
        if (entry.isDirectory()) {
          walkDir(full);
        } else {
          paths.add(rel);
        }
      }
    } catch {
      // skip unreadable dirs
    }
  };
  walkDir(outputDir);
  return paths;
};

// ── Subcommands ────────────────────────────────────────────────────────────────

const runGenerate = async (args: string[]): Promise<void> => {
  const { config, workspaceRoot } = await loadConfig(args);
  const outputDir = config.output.path;

  const { referenceCatalog, semanticCatalog, semanticFindings } =
    await buildCompileChain(config, workspaceRoot);

  if (semanticFindings.length > 0) {
    console.warn(formatFindings(semanticFindings));
  }

  // Run Tier-1 validation to get registry + sections
  console.log("Running Tier-1 validation...");
  const { registry, sections } = await runValidation(config, workspaceRoot, {
    tiers: [1],
  });

  console.log("Writing outputs...");
  await writeOutputFiles(
    config,
    workspaceRoot,
    outputDir,
    registry,
    sections,
    referenceCatalog,
    semanticCatalog,
  );

  const index = referenceCatalog.toSymbolIndex();
  console.log(
    `Documentation generated in ${outputDir} (${referenceCatalog.packages.length} packages, ${index.length} symbols)`,
  );
};

const runValidateCmd = async (args: string[]): Promise<void> => {
  const { config, workspaceRoot } = await loadConfig(args);

  const { referenceCatalog, semanticCatalog, semanticFindings } =
    await buildCompileChain(config, workspaceRoot);

  const { findings } = await runValidation(config, workspaceRoot, {
    tiers: [1, 2, 3],
    referenceCatalog,
    semanticCatalog,
    existingOutputPaths: collectOutputPaths(config.output.path),
  });

  const allFindings = [...semanticFindings, ...findings];

  // Write agent/findings.json if output dir exists
  const agentDir = join(config.output.path, "agent");
  if (existsSync(config.output.path)) {
    await mkdir(agentDir, { recursive: true });
    await writeFile(
      join(agentDir, "findings.json"),
      JSON.stringify(allFindings, null, 2),
    );
  }

  if (allFindings.length > 0) {
    console.log(formatFindings(allFindings));
  } else {
    console.log("Validation passed — no findings.");
  }

  if (hasErrors(allFindings)) {
    process.exit(1);
  }
};

const runCheck = async (args: string[]): Promise<void> => {
  const { config, workspaceRoot } = await loadConfig(args);

  const { referenceCatalog, semanticCatalog, semanticFindings } =
    await buildCompileChain(config, workspaceRoot);

  const tmpDir = await mkdtemp(join(tmpdir(), "autodoc-check-"));
  try {
    // Write to temp dir
    const { registry, sections } = await runValidation(config, workspaceRoot, {
      tiers: [1],
    });
    await writeOutputFiles(
      config,
      workspaceRoot,
      tmpDir,
      registry,
      sections,
      referenceCatalog,
      semanticCatalog,
    );

    // Compare against committed outputs
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
      if (!existsSync(generated)) return;
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
    for (const pkg of referenceCatalog.packages) {
      const shortName = pkg.name.replace("@cat/", "");
      checkFile(`packages/${shortName}.md`);
    }

    // Also run full validation (Tier-1 + Tier-2 + Tier-3)
    const tmpPaths = collectOutputPaths(tmpDir);
    const { findings } = await runValidation(config, workspaceRoot, {
      tiers: [1, 2, 3],
      referenceCatalog,
      semanticCatalog,
      existingOutputPaths: tmpPaths,
    });

    const allFindings = [...semanticFindings, ...findings];
    if (allFindings.length > 0) {
      console.log(formatFindings(allFindings));
    }

    if (outdated) {
      console.error(
        "\nDocumentation is outdated. Run 'pnpm autodoc' and commit.",
      );
      process.exit(1);
    }

    if (hasErrors(allFindings)) {
      console.error("\nValidation errors detected.");
      process.exit(1);
    }

    console.log("Documentation is up-to-date and valid.");
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

  const { config } = await loadConfig(args);
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
      const colInfo = entry.column !== undefined ? `:${entry.column}` : "";
      console.log(
        `  File: ${entry.filePath}:${entry.line}-${entry.endLine}${colInfo}`,
      );
      console.log(`  Key: ${entry.stableKey ?? entry.id}`);
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
    case "validate":
      await runValidateCmd(args.slice(1));
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
