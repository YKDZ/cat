import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { SourceExtractor } from "../types.ts";

import { extract } from "../extract.ts";
import { vueI18nExtractor } from "../extractors/vue-i18n.ts";

async function createTempFiles(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sc-extract-test-"));
  await Promise.all(
    Object.entries(files).map(async ([name, content]) => {
      const filePath = join(dir, name);
      const fileDir = filePath.substring(0, filePath.lastIndexOf("/"));
      await mkdir(fileDir, { recursive: true });
      await writeFile(filePath, content, "utf-8");
    }),
  );
  return dir;
}

const mockExtractor: SourceExtractor = {
  id: "mock",
  supportedExtensions: [".txt"],
  extract({ content, filePath, sourceLanguageId }) {
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line, i) => ({
        ref: `mock:${filePath}:L${i + 1}`,
        stableSourceRef: `source:${filePath}:L${i + 1}`,
        sourceNodeRef: `source-file:${filePath}`,
        localOrder: i,
        text: line.trim(),
        languageId: sourceLanguageId ?? "en",
        meta: { extractor: "mock", file: filePath, line: i + 1 },
        location: { startLine: i + 1, endLine: i + 1 },
      }));
  },
};

describe("extract", () => {
  it("extracts elements and generates evidence with nodes", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "Hello\nWorld",
    });

    try {
      const result = await extract({
        globs: ["src/**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
      });

      expect(result.elements).toHaveLength(2);
      expect(result.evidence.length).toBeGreaterThanOrEqual(2);
      expect(result.nodes.length).toBeGreaterThanOrEqual(1);
      expect(result.importerId).toBe("mock");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns empty result for no matching files", async () => {
    const dir = await createTempFiles({});

    try {
      const result = await extract({
        globs: ["**/*.vue"],
        extractors: [mockExtractor],
        baseDir: dir,
      });

      expect(result.elements).toHaveLength(0);
      expect(result.evidence).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates SOURCE_LOCATION evidence for source file paths", async () => {
    const dir = await createTempFiles({ "a.txt": "Hello" });

    try {
      const result = await extract({
        globs: ["**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
      });

      const sourceEvidence = result.evidence.filter(
        (e) => e.kind === "SOURCE_LOCATION",
      );
      expect(sourceEvidence.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports broken Vue SFC parsing as diagnostics", async () => {
    const dir = await createTempFiles({
      "broken.vue": `<template><div>{{ $t("broken")`,
    });

    try {
      const result = await extract({
        globs: ["**/*.vue"],
        extractors: [vueI18nExtractor],
        baseDir: dir,
        sourceLanguageId: "zh-Hans",
      });

      expect(result.elements).toHaveLength(0);
      expect(
        result.diagnostics.some(
          (diagnostic) =>
            diagnostic.code === "EXTRACT_FAILED" &&
            diagnostic.filePath === "broken.vue",
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
