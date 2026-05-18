import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type BootstrapRunReport,
  writeBootstrapRunReport,
} from "@/bootstrap/report";

const baseReport: BootstrapRunReport = {
  profileName: "bootstrap-app",
  generatedAt: "2026-05-17T00:00:00.000Z",
  sourceRevision: null,
  source: {
    baseDir: "/repo/apps/app",
    globs: ["src/**/*.{vue,ts}"],
    sourceLanguageId: "zh-Hans",
    elementCount: 1,
    nodeCount: 1,
    relationCount: 0,
    evidenceCount: 1,
  },
  locale: {
    catalogCount: 1,
    matchedElementCount: 1,
    matchedLocaleKeyCount: 1,
    staleLocaleKeyCount: 0,
    memoryItemCount: 1,
  },
  diff: {
    addedCount: 1,
    removedCount: 0,
    updatedCount: 0,
    movedCount: 0,
    semanticDiffIds: [1],
  },
  optionalServices: {
    vectorization: "skipped",
    screenshots: "not-requested",
  },
  diagnostics: {
    source: [],
    locale: [],
    warnings: [],
  },
};

describe("writeBootstrapRunReport", () => {
  it("writes JSON report without secret fields", async () => {
    const dir = await mkdtemp(join(tmpdir(), "seed-report-"));
    try {
      const outputPath = await writeBootstrapRunReport(
        dir,
        "artifacts/bootstrap-report.json",
        baseReport,
      );
      const raw = await readFile(outputPath, "utf-8");
      const parsed = JSON.parse(raw);

      expect(parsed).toEqual(
        expect.objectContaining({
          profileName: "bootstrap-app",
          optionalServices: expect.objectContaining({
            vectorization: "skipped",
          }),
        }),
      );
      expect(raw).not.toContain("password");
      expect(raw).not.toContain("apiKey");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
