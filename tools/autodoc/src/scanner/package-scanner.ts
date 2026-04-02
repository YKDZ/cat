import { glob } from "glob";
import { resolve } from "node:path";
import { Project } from "ts-morph";

import type { PackageInfo, AutodocConfig } from "../types.js";

import { createSymbolExtractor } from "../extractor/symbol-extractor.js";

export const createPackageScanner = (
  config: AutodocConfig,
): {
  scanPackage: (
    packageConfig: AutodocConfig["packages"][0],
  ) => Promise<PackageInfo>;
  scanAll: () => Promise<PackageInfo[]>;
} => {
  const project = new Project({
    tsConfigFilePath: "./tsconfig.base.json",
    skipAddingFilesFromTsConfig: true,
  });

  const extractor = createSymbolExtractor(project);

  const scanPackage = async (
    packageConfig: AutodocConfig["packages"][0],
  ): Promise<PackageInfo> => {
    const {
      path: pkgPathRaw,
      name,
      description,
      include,
      exclude,
    } = packageConfig;

    // Resolve to absolute path so file path replacement works correctly
    const pkgPath = resolve(pkgPathRaw);

    const patterns = include ?? ["src/**/*.ts"];
    const excludePatterns = exclude ?? [
      "**/*.test.ts",
      "**/*.spec.ts",
      "**/__tests__/**",
    ];

    const files = await glob(patterns, {
      cwd: pkgPath,
      ignore: excludePatterns,
      absolute: true,
    });

    for (const file of files) {
      try {
        project.addSourceFileAtPath(file);
      } catch {
        // Skip files that fail to add (e.g., already added)
      }
    }

    const modules = files.map((filePath) => {
      const sf = project.getSourceFile(filePath);
      if (!sf) {
        return {
          path: filePath,
          relativePath: filePath.replace(pkgPath + "/", ""),
          functions: [],
          types: [],
          exports: [],
          imports: [],
        };
      }
      const info = extractor.extractModuleInfo(sf);
      return {
        ...info,
        relativePath: filePath.replace(pkgPath + "/", ""),
      };
    });

    return { name, path: pkgPath, description, modules };
  };

  const scanAll = async (): Promise<PackageInfo[]> =>
    Promise.all(config.packages.map(async (pkg) => scanPackage(pkg)));

  return { scanPackage, scanAll };
};
