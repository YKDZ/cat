import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cliPath = resolve(import.meta.dirname, "cli.ts");
const BIN_SMOKE_TEST_TIMEOUT_MS = 15_000;
const BIN_PROCESS_TIMEOUT_MS = 12_000;

describe("source-collector bin", () => {
  it(
    "runs directly on Node 24",
    () => {
      expect(process.versions.node.split(".")[0]).toBe("24");
      expect(
        execFileSync(cliPath, ["--help"], {
          encoding: "utf8",
          timeout: BIN_PROCESS_TIMEOUT_MS,
        }),
      ).toContain("source-collector");
    },
    BIN_SMOKE_TEST_TIMEOUT_MS,
  );

  it(
    "runs through an installed-style bin link",
    () => {
      const testRoot = mkdtempSync(join(tmpdir(), "cat-source-bin-"));
      try {
        const binDir = join(testRoot, ".bin");
        mkdirSync(binDir);
        const installedBin = join(binDir, "source-collector");
        symlinkSync(cliPath, installedBin);

        expect(
          execFileSync(installedBin, ["--help"], {
            encoding: "utf8",
            timeout: BIN_PROCESS_TIMEOUT_MS,
          }),
        ).toContain("source-collector");
      } finally {
        rmSync(testRoot, { force: true, recursive: true });
      }
    },
    BIN_SMOKE_TEST_TIMEOUT_MS,
  );
});
