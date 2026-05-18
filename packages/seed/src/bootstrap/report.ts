import type { SourceCollectionDiagnostic } from "@cat/source-collector";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { LocaleBridgeDiagnostic } from "./locale-bridge";

/**
 * @zh Bootstrap 运行报告。
 * @en Bootstrap run report.
 */
export type BootstrapRunReport = {
  profileName: string;
  generatedAt: string;
  sourceRevision: string | null;
  source: {
    baseDir: string;
    globs: string[];
    sourceLanguageId: string;
    elementCount: number;
    nodeCount: number;
    relationCount: number;
    evidenceCount: number;
  };
  locale: {
    catalogCount: number;
    matchedElementCount: number;
    matchedLocaleKeyCount: number;
    staleLocaleKeyCount: number;
    memoryItemCount: number;
  };
  diff: {
    addedCount: number;
    removedCount: number;
    updatedCount: number;
    movedCount: number;
    semanticDiffIds: number[];
  };
  optionalServices: {
    vectorization: "enabled" | "skipped" | "unavailable" | "failed";
    screenshots:
      | "not-requested"
      | "pending"
      | "captured"
      | "skipped"
      | "failed";
  };
  diagnostics: {
    source: SourceCollectionDiagnostic[];
    locale: LocaleBridgeDiagnostic[];
    warnings: string[];
  };
};

/**
 * @zh 写入自举运行报告。
 * @en Write a bootstrap run report.
 *
 * @param seedDir - {@zh seed 数据集目录} {@en Seed dataset directory}
 * @param outputPath - {@zh 相对或绝对输出路径} {@en Relative or absolute output path}
 * @param report - {@zh 报告内容} {@en Report payload}
 * @returns - {@zh 报告绝对路径} {@en Absolute report path}
 */
export const writeBootstrapRunReport = async (
  seedDir: string,
  outputPath: string,
  report: BootstrapRunReport,
): Promise<string> => {
  const absPath = resolve(seedDir, outputPath);
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  return absPath;
};
