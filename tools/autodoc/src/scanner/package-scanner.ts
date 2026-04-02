import { glob } from "glob";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Project } from "ts-morph";
import { z } from "zod";

import type { PackageIR, ModuleIR } from "../ir.js";
import type { AutodocConfig } from "../types.js";

import { createSymbolExtractor } from "../extractor/symbol-extractor.js";

const PackageJsonSchema = z.object({ description: z.string().optional() });

const readPackageDescription = async (
  pkgPath: string,
): Promise<string | undefined> => {
  try {
    const content = await readFile(join(pkgPath, "package.json"), "utf-8");
    const pkg = PackageJsonSchema.parse(JSON.parse(content));
    return pkg.description;
  } catch {
    return undefined;
  }
};

export const createPackageScanner = (
  config: AutodocConfig,
): {
  scanPackage: (
    packageConfig: AutodocConfig["packages"][0],
  ) => Promise<PackageIR>;
  scanAll: () => Promise<PackageIR[]>;
} => {
  const scanPackage = async (
    packageConfig: AutodocConfig["packages"][0],
  ): Promise<PackageIR> => {
    const { path: pkgPathRaw, name, include, exclude } = packageConfig;

    // pkgPathRaw is already resolved to absolute by the CLI loadConfig
    const pkgPath = pkgPathRaw;
    const wsRoot = process.env.NX_WORKSPACE_ROOT ?? process.cwd();

    // Prefer package-level tsconfig for correct path alias resolution (@/*)
    const pkgTsConfigLib = join(pkgPath, "tsconfig.lib.json");
    const pkgTsConfig = join(pkgPath, "tsconfig.json");
    const tsConfigFilePath = existsSync(pkgTsConfigLib)
      ? pkgTsConfigLib
      : existsSync(pkgTsConfig)
        ? pkgTsConfig
        : resolve(wsRoot, "tsconfig.base.json");

    // Each package uses its own independent Project instance for isolation
    const project = new Project({
      tsConfigFilePath,
      skipAddingFilesFromTsConfig: true,
    });

    const extractor = createSymbolExtractor(name, wsRoot);

    const patterns = include ?? ["src/**/*.ts"];
    const excludePatterns = exclude ?? [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/__tests__/**",
    ];

    const files = (
      await glob(patterns, {
        cwd: pkgPath,
        ignore: excludePatterns,
        absolute: true,
      })
    ).sort();

    for (const file of files) {
      try {
        project.addSourceFileAtPath(file);
      } catch {
        // Skip files that fail to add (e.g., already added)
      }
    }

    const modules: ModuleIR[] = files
      .map((filePath) => {
        const sf = project.getSourceFile(filePath);
        if (!sf) {
          return {
            relativePath: filePath.replace(pkgPath + "/", ""),
            symbols: [],
          };
        }
        return extractor.extractModuleInfo(sf);
      })
      .filter((mod) => mod.symbols.length > 0);

    const description = await readPackageDescription(pkgPath);
    const priority = packageConfig.priority ?? "medium";

    return { name, path: pkgPath, description, priority, modules };
  };

  const scanAll = async (): Promise<PackageIR[]> =>
    Promise.all(config.packages.map(async (pkg) => scanPackage(pkg)));

  return { scanPackage, scanAll };
};
