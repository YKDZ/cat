import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { SourceExtractor } from "../types.ts";

import { extract } from "../extract.ts";

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
  extract({ content, filePath }) {
    return content
      .split("\n")
      .filter((line) => line.trim() !== "")
      .map((line, i) => ({
        ref: `mock:${filePath}:L${i + 1}`,
        text: line.trim(),
        meta: { extractor: "mock", file: filePath, line: i + 1 },
        location: { startLine: i + 1, endLine: i + 1 },
      }));
  },
};

describe("extract", () => {
  it("extracts elements and generates contexts with metadata", async () => {
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
      expect(result.contexts.length).toBeGreaterThanOrEqual(2);
      expect(result.metadata).toBeDefined();
      expect(result.metadata?.extractorIds).toEqual(["mock"]);
      expect(result.metadata?.baseDir).toBe(dir);
      expect(result.metadata?.timestamp).toBeTruthy();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns empty result with metadata for no matching files", async () => {
    const dir = await createTempFiles({});

    try {
      const result = await extract({
        globs: ["**/*.vue"],
        extractors: [mockExtractor],
        baseDir: dir,
      });

      expect(result.elements).toHaveLength(0);
      expect(result.contexts).toHaveLength(0);
      expect(result.metadata).toBeDefined();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates source file path contexts", async () => {
    const dir = await createTempFiles({ "a.txt": "Hello" });

    try {
      const result = await extract({
        globs: ["**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
      });

      const sourceContexts = result.contexts.filter(
        (c) => c.type === "TEXT" && c.data.text.startsWith("Source:"),
      );
      expect(sourceContexts).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
