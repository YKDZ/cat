import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { SourceExtractor } from "../types.ts";

import { collect } from "../collect.ts";

async function createTempFiles(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "sc-test-"));
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

describe("collect", () => {
  it("discovers files by glob and runs extractor", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "Hello\nWorld",
      "src/b.txt": "Foo",
    });

    try {
      const payload = await collect({
        globs: ["src/**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "12345678-1234-4000-8000-000000000001",
        sourceLanguageId: "en",
        sourceRootRef: dir,
      });

      expect(payload.projectId).toBe("12345678-1234-4000-8000-000000000001");
      expect(payload.sourceLanguageId).toBe("en");
      expect(payload.payloadVersion).toBe("content-graph/v1");
      expect(payload.elements).toHaveLength(3); // "Hello", "World", "Foo"
      expect(payload.evidence.length).toBeGreaterThanOrEqual(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips files with unsupported extensions", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "Match",
      "src/b.json": '{ "no": "match" }',
    });

    try {
      const payload = await collect({
        globs: ["src/**/*"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "12345678-1234-4000-8000-000000000001",
        sourceLanguageId: "en",
        sourceRootRef: dir,
      });

      expect(payload.elements).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates SOURCE_LOCATION evidence for source file paths", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "Hello",
    });

    try {
      const payload = await collect({
        globs: ["src/**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "12345678-1234-4000-8000-000000000001",
        sourceLanguageId: "en",
        sourceRootRef: dir,
      });

      const sourceEvidence = payload.evidence.filter(
        (e) => e.kind === "SOURCE_LOCATION",
      );
      expect(sourceEvidence.length).toBeGreaterThanOrEqual(1);
      const firstEvidence = sourceEvidence[0];
      if (firstEvidence) {
        expect(firstEvidence.textData).toContain("src/a.txt");
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("returns empty elements for no matching files", async () => {
    const dir = await createTempFiles({});

    try {
      const payload = await collect({
        globs: ["**/*.vue"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "12345678-1234-4000-8000-000000000001",
        sourceLanguageId: "en",
        sourceRootRef: dir,
      });

      expect(payload.elements).toHaveLength(0);
      // When no files match, we still have a root sentinel node
      expect(payload.nodes.length).toBeGreaterThanOrEqual(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("passes the configured source language through collect", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "你好",
    });

    try {
      const payload = await collect({
        globs: ["src/**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "12345678-1234-4000-8000-000000000001",
        sourceLanguageId: "zh-Hans",
        sourceRootRef: dir,
      });

      expect(payload.elements).toHaveLength(1);
      expect(
        payload.elements.every((element) => element.languageId === "zh-Hans"),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
