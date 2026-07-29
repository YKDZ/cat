import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const retiredRunner = ["m", "oon"].join("");
const removedPrecommitCommand = ["pre", "commit"].join("");
const removedTsxPackage = ["t", "sx"].join("");
const removedDtsPackage = ["unplugin", "dts"].join("-");
const removedLegacyDeployCommand = ["pnpm deploy --", "legacy"].join("");
const retiredRunnerPackage = `@${retiredRunner}repo/cli`;
const retiredRunnerConfig = `${retiredRunner}.yml`;
const retiredRunnerReference = new RegExp(
  [
    `${retiredRunner}repo`,
    `\\.${retiredRunner}(?:/|\\b)`,
    `\\b${retiredRunner}\\s+(?:run|task|config|cache|specific)\\b`,
    `pnpm\\s+${retiredRunner}\\b`,
  ].join("|"),
  "i",
);
type RepositoryEntry = {
  path: string;
  isFile: boolean;
};

const repositoryFiles = (): string[] =>
  execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter(Boolean)
    .map((path) => join(root, path))
    .filter((path) => existsSync(path) && statSync(path).isFile());

const repositoryEntries = (): RepositoryEntry[] =>
  repositoryFiles().map((path) => ({ path, isFile: true }));

const manifests = (): string[] =>
  repositoryFiles().filter(
    (path) =>
      path.endsWith("package.json") &&
      !relative(root, path).startsWith("docs/archive/"),
  );

const guidanceFiles = (): string[] =>
  repositoryFiles().filter((path) => {
    const repositoryPath = relative(root, path);
    return (
      repositoryPath === "AGENTS.md" ||
      (repositoryPath.startsWith(".agents/") && path.endsWith(".md")) ||
      (repositoryPath.startsWith("docs/") &&
        !repositoryPath.startsWith("docs/archive/") &&
        path.endsWith(".md"))
    );
  });

const legacyGuidanceReference = new RegExp(
  [
    "TypeScript\\s+5(?:\\.x)?\\b",
    "pnpm\\s+10(?:\\.32)?\\+?\\b",
    "pnpm@10\\b",
    "turbo\\.(?:yml|yaml)\\b",
    "\\.Node\\s+24\\b",
    `${["apps", "app-api"].join("/")}\\b`,
    `\\b(?:pnpm\\s+)?vitest(?:\\s+\\S+)*\\s+${["--pro", "ject"].join("")}(?:=|\\b)`,
    `pnpm\\s+${["t", "sx"].join("")}\\b`,
    "\\bpnpm\\s+turbo\\s+run\\s+(?!(?:build|codegen|format|generate|lint|test|typecheck)(?::|\\b))[^\\s:]+:",
  ].join("|"),
  "i",
);

describe("toolchain retirement contract", () => {
  it("does not scan ignored runtime artifacts as repository source", () => {
    const artifactDirectory = join(
      root,
      ".tmp",
      `toolchain-retirement-${process.pid}`,
    );
    const artifact = join(artifactDirectory, `${retiredRunner}.txt`);
    mkdirSync(artifactDirectory, { recursive: true });
    writeFileSync(artifact, `${retiredRunner} run stale-artifact\n`);

    try {
      expect(repositoryFiles()).not.toContain(artifact);
      expect(repositoryEntries().map(({ path }) => path)).not.toContain(
        artifact,
      );
    } finally {
      rmSync(artifactDirectory, { recursive: true, force: true });
    }
  });

  it("removes retired runner files, directories, and active references", () => {
    const offenders = repositoryEntries().filter(({ isFile, path }) => {
      const repositoryPath = relative(root, path);
      return (
        repositoryPath
          .split("/")
          .some((part) => part.toLowerCase().includes(retiredRunner)) ||
        path.toLowerCase().endsWith(retiredRunnerConfig) ||
        (isFile &&
          existsSync(path) &&
          retiredRunnerReference.test(readFileSync(path, "utf8")))
      );
    });

    expect(existsSync(join(root, `.${retiredRunner}`))).toBe(false);
    expect(offenders.map(({ path }) => relative(root, path))).toEqual([]);
  });

  it("keeps the root catalog and lockfile free of the retired runner", () => {
    const rootManifest = JSON.parse(
      readFileSync(join(root, "package.json"), "utf8"),
    ) as { devDependencies?: Record<string, string> };
    const workspaceConfig = readFileSync(
      join(root, "pnpm-workspace.yaml"),
      "utf8",
    );
    const lockfile = readFileSync(join(root, "pnpm-lock.yaml"), "utf8");

    expect(
      rootManifest.devDependencies?.[retiredRunnerPackage],
    ).toBeUndefined();
    expect(workspaceConfig).not.toContain(retiredRunnerPackage);
    expect(lockfile).not.toContain(retiredRunnerPackage);
  });

  it("does not retain removed quality or generic task command surfaces", () => {
    const removedCommands = [
      removedPrecommitCommand,
      removedTsxPackage,
      removedDtsPackage,
      removedLegacyDeployCommand,
    ];

    for (const path of manifests()) {
      const manifest = JSON.parse(readFileSync(path, "utf8")) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
        scripts?: Record<string, string>;
      };
      const commands = Object.entries(manifest.scripts ?? {});
      expect(manifest.scripts?.[removedCommands[0]!], path).toBeUndefined();
      expect(
        manifest.dependencies?.[removedCommands[1]!],
        path,
      ).toBeUndefined();
      expect(
        manifest.devDependencies?.[removedCommands[1]!],
        path,
      ).toBeUndefined();
      expect(
        manifest.dependencies?.[removedCommands[2]!],
        path,
      ).toBeUndefined();
      expect(
        manifest.devDependencies?.[removedCommands[2]!],
        path,
      ).toBeUndefined();

      for (const [name, command] of commands) {
        expect(name, path).not.toBe(["w", "atch"].join(""));
        expect(command, `${path} ${name}`).not.toContain(removedCommands[3]!);
        expect(command, `${path} ${name}`).not.toMatch(/\bwatch\b/);
      }
    }
  });

  it("keeps contributor guidance free of retired toolchain commands", () => {
    const forbiddenGuidance = new RegExp(
      [
        `pnpm\\s+${["t", "sx"].join("")}\\b`,
        ["unplugin", "dts"].join("-"),
        removedPrecommitCommand,
        ["pnpm\\s+deploy\\s+--", "legacy"].join(""),
      ].join("|"),
      "i",
    );

    const offenders = guidanceFiles().filter((path) =>
      forbiddenGuidance.test(readFileSync(path, "utf8")),
    );
    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });

  it("keeps contributor guidance aligned with available command surfaces", () => {
    const unavailableGuidance = new RegExp(
      [
        ["pnpm\\s+", "eval\\s+run\\b"].join(""),
        ["pnpm\\s+", "preview\\b"].join(""),
        [
          "packages/screenshot-collector/src/cli\\.ts\\s+collect\\b(?:(?!\\n\\n)[\\s\\S])*?--",
          "upload\\b",
        ].join(""),
        ["datasets/", "default\\b"].join(""),
      ].join("|"),
      "i",
    );
    const offenders = guidanceFiles().filter((path) =>
      unavailableGuidance.test(readFileSync(path, "utf8")),
    );

    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });

  it("keeps ignored contributor guidance aligned with the native toolchain", () => {
    const offenders = guidanceFiles().filter((path) =>
      legacyGuidanceReference.test(readFileSync(path, "utf8")),
    );

    expect(offenders.map((path) => relative(root, path))).toEqual([]);
  });
});
