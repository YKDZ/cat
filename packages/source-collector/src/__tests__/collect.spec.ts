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
        projectId: "00000000-0000-0000-0000-000000000001",
        sourceLanguageId: "en",
        documentName: "test-doc",
      });

      expect(payload.projectId).toBe("00000000-0000-0000-0000-000000000001");
      expect(payload.sourceLanguageId).toBe("en");
      expect(payload.document.name).toBe("test-doc");
      expect(payload.elements).toHaveLength(3); // "Hello", "World", "Foo"
      expect(payload.contexts.length).toBeGreaterThanOrEqual(3);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("skips files with unsupported extensions", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "Match",
      "src/b.json": '{"no":"match"}',
    });

    try {
      const payload = await collect({
        globs: ["src/**/*"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "00000000-0000-0000-0000-000000000001",
        sourceLanguageId: "en",
        documentName: "test-doc",
      });

      expect(payload.elements).toHaveLength(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates TEXT contexts for source file paths", async () => {
    const dir = await createTempFiles({
      "src/a.txt": "Hello",
    });

    try {
      const payload = await collect({
        globs: ["src/**/*.txt"],
        extractors: [mockExtractor],
        baseDir: dir,
        projectId: "00000000-0000-0000-0000-000000000001",
        sourceLanguageId: "en",
        documentName: "test-doc",
      });

      const sourceContexts = payload.contexts.filter(
        (c) => c.type === "TEXT" && c.data.text.startsWith("Source:"),
      );
      expect(sourceContexts).toHaveLength(1);
      const sourceCtx = sourceContexts[0];
      if (sourceCtx.type !== "TEXT") throw new Error("Expected TEXT context");
      expect(sourceCtx.data.text).toContain("src/a.txt");
      expect(sourceCtx.elementRef).toBe(payload.elements[0].ref);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("generates @i18n-context TEXT contexts when present", async () => {
    const customExtractor: SourceExtractor = {
      id: "ctx-test",
      supportedExtensions: [".txt"],
      extract({ filePath }) {
        return [
          {
            ref: `ctx:${filePath}:1`,
            text: "test",
            meta: { file: filePath },
            location: {
              startLine: 1,
              endLine: 1,
              custom: { i18nContext: "这是一个按钮" },
            },
          },
        ];
      },
    };

    const dir = await createTempFiles({ "a.txt": "test" });

    try {
      const payload = await collect({
        globs: ["**/*.txt"],
        extractors: [customExtractor],
        baseDir: dir,
        projectId: "00000000-0000-0000-0000-000000000001",
        sourceLanguageId: "en",
        documentName: "test-doc",
      });

      const i18nContexts = payload.contexts.filter(
        (c) => c.type === "TEXT" && !c.data.text.startsWith("Source:"),
      );
      expect(i18nContexts).toHaveLength(1);
      const i18nCtx = i18nContexts[0];
      if (i18nCtx.type !== "TEXT") throw new Error("Expected TEXT context");
      expect(i18nCtx.data.text).toBe("这是一个按钮");
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
        projectId: "00000000-0000-0000-0000-000000000001",
        sourceLanguageId: "en",
        documentName: "test-doc",
      });

      expect(payload.elements).toHaveLength(0);
      expect(payload.contexts).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
