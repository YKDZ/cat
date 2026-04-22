import { describe, expect, it } from "vitest";

import { getCatalogOutputPaths } from "./catalog-output.js";
import { AutodocConfigSchema } from "./types.js";

describe("getCatalogOutputPaths", () => {
  it("defaults to a generic catalog output layout", () => {
    const config = AutodocConfigSchema.parse({
      packages: [],
      output: {},
      llmsTxt: { enabled: false },
    });

    expect(getCatalogOutputPaths(config)).toEqual({
      directory: "catalog",
      subjectsRelativePath: "catalog/subjects.json",
      referencesRelativePath: "catalog/references.json",
      findingsRelativePath: "catalog/findings.json",
    });
  });

  it("uses configured directory and filenames", () => {
    const config = AutodocConfigSchema.parse({
      packages: [],
      output: {},
      llmsTxt: { enabled: false },
      catalog: {
        directory: "catalog",
        subjectsFile: "subjects.json",
        referencesFile: "symbols.json",
        findingsFile: "validation.json",
      },
    });

    expect(getCatalogOutputPaths(config)).toEqual({
      directory: "catalog",
      subjectsRelativePath: "catalog/subjects.json",
      referencesRelativePath: "catalog/symbols.json",
      findingsRelativePath: "catalog/validation.json",
    });
  });
});
