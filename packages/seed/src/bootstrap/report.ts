import type { SourceCollectionDiagnostic } from "@cat/source-collector";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import type { LocaleBridgeDiagnostic } from "./locale-bridge";

/**
 * Bootstrap run report.
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
 * Write a bootstrap run report.
 *
 * @param seedDir - Seed dataset directory
 * @param outputPath - Relative or absolute output path
 * @param report - Report payload
 * @returns - Absolute report path
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
