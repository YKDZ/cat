import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const cliPath = resolve(import.meta.dirname, "cli.ts");

describe("source-collector bin", () => {
  it("runs directly on Node 24", () => {
    expect(process.versions.node.split(".")[0]).toBe("24");
    expect(execFileSync(cliPath, ["--help"], { encoding: "utf8" })).toContain(
      "source-collector",
    );
  });

  it("runs through an installed-style bin link", () => {
    const binDir = join(mkdtempSync(join(tmpdir(), "cat-source-bin-")), ".bin");
    mkdirSync(binDir);
    const installedBin = join(binDir, "source-collector");
    symlinkSync(cliPath, installedBin);

    expect(
      execFileSync(installedBin, ["--help"], { encoding: "utf8" }),
    ).toContain("source-collector");
  });
});
