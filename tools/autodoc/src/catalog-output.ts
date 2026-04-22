import type { AutodocConfig } from "./types.js";

export interface CatalogOutputPaths {
  directory: string;
  subjectsRelativePath: string;
  referencesRelativePath: string;
  findingsRelativePath: string;
}

export const getCatalogOutputPaths = (
  config: AutodocConfig,
): CatalogOutputPaths => {
  const directory = config.catalog?.directory ?? "catalog";
  const subjectsFile = config.catalog?.subjectsFile ?? "subjects.json";
  const referencesFile = config.catalog?.referencesFile ?? "references.json";
  const findingsFile = config.catalog?.findingsFile ?? "findings.json";

  return {
    directory,
    subjectsRelativePath: `${directory}/${subjectsFile}`,
    referencesRelativePath: `${directory}/${referencesFile}`,
    findingsRelativePath: `${directory}/${findingsFile}`,
  };
};
