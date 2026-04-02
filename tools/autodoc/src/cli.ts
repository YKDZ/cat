#!/usr/bin/env node
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import yaml from "yaml";

import { createLlmsTxtRenderer } from "./renderer/llms-txt-renderer.js";
import { createOverviewRenderer } from "./renderer/overview-renderer.js";
import { createPackageRenderer } from "./renderer/package-renderer.js";
import { createPackageScanner } from "./scanner/package-scanner.js";
import { AutodocConfigSchema } from "./types.js";

const main = async () => {
  const { values } = parseArgs({
    options: {
      config: {
        type: "string",
        short: "c",
        default: "autodoc.config.yaml",
      },
      output: { type: "string", short: "o" },
      check: { type: "boolean", default: false },
    },
  });

  // Load and validate config
  const configContent = await readFile(values.config, "utf-8");
  const rawConfig = yaml.parse(configContent) as unknown;
  const config = AutodocConfigSchema.parse(rawConfig);

  // Override output path if provided via CLI arg
  if (values.output) {
    config.output.path = values.output;
  }

  // Scan
  console.log("Scanning packages...");
  const scanner = createPackageScanner(config);
  const packages = await scanner.scanAll();

  // Render
  const overviewRenderer = createOverviewRenderer(config);
  const pkgRenderer = createPackageRenderer();
  const llmsRenderer = createLlmsTxtRenderer();

  if (values.check) {
    // Check mode: generate to a temp location and compare
    const { mkdtemp, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { existsSync, readFileSync } = await import("node:fs");

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
            config.packages.find((p) => p.name === pkg.name)?.priority ===
            "high";
          const pkgContent = pkgRenderer.renderPackage(pkg, {
            detailed: isHighPriority,
          });
          const shortName = pkg.name.replace("@cat/", "");
          await writeFile(
            join(tmpDir, "packages", `${shortName}.md`),
            pkgContent,
          );
        }),
      );

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
      for (const pkg of packages) {
        const shortName = pkg.name.replace("@cat/", "");
        checkFile(`packages/${shortName}.md`);
      }

      if (outdated) {
        console.error(
          "\nDocumentation is outdated. Run 'pnpm nx run autodoc:generate' and commit.",
        );
        process.exit(1);
      } else {
        console.log("Documentation is up-to-date.");
      }
    } finally {
      await rm(tmpDir, { recursive: true });
    }
    return;
  }

  // Generate mode
  const outputDir = config.output.path;
  await mkdir(join(outputDir, "packages"), { recursive: true });

  // Write overview (progressive layer 1)
  const overviewContent = overviewRenderer.render(packages);
  await writeFile(join(outputDir, "overview.md"), overviewContent);

  // Write llms.txt
  if (config.llmsTxt.enabled) {
    const llmsContent = llmsRenderer.render(packages);
    await writeFile(join(outputDir, "llms.txt"), llmsContent);
  }

  // Write per-package docs (progressive layer 2)
  await Promise.all(
    packages.map(async (pkg) => {
      const isHighPriority =
        config.packages.find((p) => p.name === pkg.name)?.priority === "high";
      const pkgContent = pkgRenderer.renderPackage(pkg, {
        detailed: isHighPriority,
      });
      const shortName = pkg.name.replace("@cat/", "");
      await writeFile(
        join(outputDir, "packages", `${shortName}.md`),
        pkgContent,
      );
    }),
  );

  console.log(
    `Generated documentation for ${packages.length} packages → ${outputDir}`,
  );
};

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
