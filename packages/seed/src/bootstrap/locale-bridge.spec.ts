import type { StructuredTranslatableElementInput } from "@cat/shared";

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { buildLocaleBridgeMaterial } from "@/bootstrap/locale-bridge";

const createTempDir = async (): Promise<string> => {
  return mkdtemp(join(tmpdir(), "seed-locale-bridge-"));
};

const writeCatalog = async (
  dir: string,
  relativePath: string,
  content: string,
): Promise<void> => {
  const filePath = join(dir, relativePath);
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf-8");
};

const elements: StructuredTranslatableElementInput[] = [
  {
    ref: "element:one",
    stableSourceRef: "stable:one",
    sourceNodeRef: "node:one",
    localOrder: 0,
    text: "你好",
    languageId: "zh-Hans",
  },
  {
    ref: "element:two",
    stableSourceRef: "stable:two",
    sourceNodeRef: "node:one",
    localOrder: 1,
    text: "你好",
    languageId: "zh-Hans",
  },
];

describe("buildLocaleBridgeMaterial", () => {
  it("emits one memory item and evidence for all matching elements", async () => {
    const dir = await createTempDir();
    try {
      await writeCatalog(
        dir,
        "locales/en_us.json",
        JSON.stringify({ 你好: "Hello" }),
      );
      const result = await buildLocaleBridgeMaterial({
        seedDir: dir,
        elements,
        catalogs: [
          {
            path: "locales/en_us.json",
            localeId: "en_us",
            languageId: "en",
          },
        ],
        sourceLanguageId: "zh-Hans",
      });

      expect(result.memoryItems).toHaveLength(1);
      expect(result.memoryItems[0]?.translationLanguageId).toBe("en");
      expect(result.evidence).toHaveLength(2);
      expect(result.matchedElementCount).toBe(2);
      expect(result.diagnostics).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports stale locale keys", async () => {
    const dir = await createTempDir();
    try {
      await writeCatalog(
        dir,
        "locales/en_us.json",
        JSON.stringify({ 再见: "Goodbye" }),
      );
      const result = await buildLocaleBridgeMaterial({
        seedDir: dir,
        elements,
        catalogs: [
          {
            path: "locales/en_us.json",
            localeId: "en_us",
            languageId: "en",
          },
        ],
        sourceLanguageId: "zh-Hans",
      });

      expect(
        result.diagnostics.some(
          (diagnostic: { code: string }) =>
            diagnostic.code === "STALE_LOCALE_KEY",
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("reports duplicate JSON keys", async () => {
    const dir = await createTempDir();
    try {
      await writeCatalog(
        dir,
        "locales/en_us.json",
        '{"你好":"Hello","你好":"Hi"}',
      );
      const result = await buildLocaleBridgeMaterial({
        seedDir: dir,
        elements,
        catalogs: [
          {
            path: "locales/en_us.json",
            localeId: "en_us",
            languageId: "en",
          },
        ],
        sourceLanguageId: "zh-Hans",
      });

      expect(
        result.diagnostics.some(
          (diagnostic: { code: string }) =>
            diagnostic.code === "DUPLICATE_LOCALE_KEY",
        ),
      ).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("uses explicit catalog language mapping", async () => {
    const dir = await createTempDir();
    try {
      await writeCatalog(
        dir,
        "locales/custom.json",
        JSON.stringify({ 你好: "Bonjour" }),
      );
      const result = await buildLocaleBridgeMaterial({
        seedDir: dir,
        elements,
        catalogs: [
          {
            path: "locales/custom.json",
            localeId: "fr_custom",
            languageId: "fr",
          },
        ],
        sourceLanguageId: "zh-Hans",
      });

      expect(result.memoryItems[0]?.translationLanguageId).toBe("fr");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
