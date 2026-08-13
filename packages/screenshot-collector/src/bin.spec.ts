import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cliPath = resolve(import.meta.dirname, "cli.ts");
const cliExecutionOptions = { encoding: "utf8", timeout: 10_000 } as const;
const cliSmokeTimeoutMs = 15_000;

describe("screenshot-collector bin", () => {
  it(
    "runs directly on Node 24",
    () => {
      expect(process.versions.node.split(".")[0]).toBe("24");
      expect(execFileSync(cliPath, ["--help"], cliExecutionOptions)).toContain(
        "screenshot-collector",
      );
    },
    cliSmokeTimeoutMs,
  );

  it(
    "runs through an installed-style bin link",
    () => {
      const binDir = join(
        mkdtempSync(join(tmpdir(), "cat-screenshot-bin-")),
        ".bin",
      );
      mkdirSync(binDir);
      const installedBin = join(binDir, "screenshot-collector");
      symlinkSync(cliPath, installedBin);

      expect(
        execFileSync(installedBin, ["--help"], cliExecutionOptions),
      ).toContain("screenshot-collector");
    },
    cliSmokeTimeoutMs,
  );
});
