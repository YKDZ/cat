import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const removedPrecommitCommand = ["pre", "commit"].join("");
const rootScopedOxcWorkspaces = new Set([
  "apps/app",
  "@cat-plugin/tiny-widget",
  "packages/plugin-core",
  "packages/ui",
]);
const sourceFilePattern = /\.(?:[cm]?[jt]sx?|vue|json|md|yaml|yml|css|html)$/;
const ignoredSourceDirectories = new Set(["dist", "node_modules", "out-tsc"]);
const workspacePackageFiles = (): string[] => {
  const roots = ["apps", "packages", "@cat-plugin", "tools"];
  return roots.flatMap((directory) =>
    readdirSync(resolve(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => resolve(root, directory, entry.name, "package.json"))
      .filter((file) => existsSync(file)),
  );
};

const packageTestFiles = (packageRoot: string): string[] => {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        visit(path);
      } else if (/\.(?:spec|test)\.[cm]?[jt]sx?$/.test(entry.name)) {
        files.push(path);
      }
    }
  };
  visit(packageRoot);
  return files;
};

const sourceFiles = (roots: string[]): string[] => {
  const files: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredSourceDirectories.has(entry.name)) {
          visit(path);
        }
      } else if (entry.isFile() && sourceFilePattern.test(entry.name)) {
        files.push(path);
      }
    }
  };
  for (const directory of roots) {
    visit(resolve(root, directory));
  }
  return files;
};
const readRootManifest = (): {
  scripts?: Record<string, string>;
} =>
  JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

describe("repository quality command contract", () => {
  it("removes historical diagnostic situations from application sources", () => {
    const offenders = sourceFiles(["apps", "packages", "@cat-plugin"]).filter(
      (file) => /situation:|withSituation/.test(readFileSync(file, "utf8")),
    );

    expect(offenders.map((file) => file.replace(`${root}/`, ""))).toEqual([]);
  });

  it("routes browser-runtime errors through structured diagnostics", () => {
    const offenders = sourceFiles([
      "apps/app/src/pages/index",
      "packages/plugin-core/src/client/sce",
    ]).filter((file) =>
      /console\.(debug|info|warn|error|log)/.test(readFileSync(file, "utf8")),
    );

    expect(offenders.map((file) => file.replace(`${root}/`, ""))).toEqual([]);
  });

  it("keeps root checks explicit and removes the central Vitest registry", () => {
    const scripts = readRootManifest().scripts ?? {};

    expect(scripts.check).toBeDefined();
    expect(scripts["check:all"]).toBeDefined();
    expect(scripts.fix).toBeDefined();
    expect(scripts[removedPrecommitCommand]).toBeUndefined();
    expect(existsSync(resolve(root, "vitest.config.ts"))).toBe(false);
  });

  it("runs the complete read-only quality graph through one concise Turbo command", () => {
    const scripts = readRootManifest().scripts ?? {};
    const check = scripts.check ?? "";

    expect(check).not.toMatch(/(?:\bfix\b|migrate|push|docker|playwright)/i);
    expect(check).toMatch(/^turbo run /);
    expect(check).not.toContain("&&");
    for (const task of [
      "boundaries",
      "format:check",
      "lint",
      "typecheck",
      "test:unit",
      "codegen:check",
      "test:tooling",
    ]) {
      expect(check).toContain(task);
    }
    expect(check).toContain("--output-logs=errors-only");
    expect(check).toContain("--log-order=grouped");
    expect(check).toContain("--log-prefix=task");
    expect(check).toContain("--continue=dependencies-successful");
    expect(scripts.test).toBe("pnpm test:tooling");
    expect(scripts["test:tooling"]).toContain("scripts/vitest.config.ts");
    expect(
      readFileSync(resolve(root, "scripts/vitest.config.ts"), "utf8"),
    ).toMatch(/include:[\s\S]+\.spec\.ts/);
    expect(scripts["test:tooling"]).not.toContain("public-packages.test.ts");
  });

  it("keeps every root Turbo entrypoint concise without wrapping its output", () => {
    const scripts = readRootManifest().scripts ?? {};
    for (const name of [
      "build",
      "build-plugins",
      "build:all",
      "test:integration",
    ] as const) {
      const command = scripts[name] ?? "";
      expect(command, name).toMatch(/^turbo run /);
      expect(command, name).toContain("--output-logs=errors-only");
      expect(command, name).toContain("--log-order=grouped");
      expect(command, name).toContain("--log-prefix=task");
    }
  });

  it("discovers root tooling specs without services or artifact tests", () => {
    const result = spawnSync(
      "pnpm",
      ["exec", "vitest", "list", "--config", "scripts/vitest.config.ts"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/unreachable",
          HTTP_PROXY: "http://127.0.0.1:1",
          HTTPS_PROXY: "http://127.0.0.1:1",
          REDIS_URL: "redis://127.0.0.1:1",
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("scripts/quality-contract.spec.ts");
    expect(result.stdout).not.toContain("public-packages.test.ts");
  });

  it("uses direct Oxc scripts with quiet read-only commands", () => {
    const scripts = readRootManifest().scripts ?? {};
    expect(scripts.fix).toMatch(/format:write/);
    expect(scripts.fix).toMatch(/lint:fix/);
    expect(scripts["format:check"]).toMatch(/^oxfmt /);
    expect(scripts["format:check"]).toContain("--list-different");
    expect(scripts["format:write"]).toMatch(/^oxfmt /);
    expect(scripts["format:write"]).toContain("--write");
    expect(scripts.lint).toMatch(/^oxlint /);
    expect(scripts.lint).toContain("--quiet");
    expect(scripts.lint).toContain("--format=unix");
    expect(scripts["lint:fix"]).toMatch(/^oxlint /);
    expect(scripts["lint:fix"]).toContain("--fix");
    expect(scripts["lint:fix"]).not.toContain("--quiet");
    expect(scripts.format).toBeUndefined();
    for (const file of workspacePackageFiles()) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const packageScripts = manifest.scripts ?? {};
      const rootScopedTarget = file
        .replace(`${root}/`, "")
        .replace("/package.json", "");
      const useRootScopedCommand =
        rootScopedOxcWorkspaces.has(rootScopedTarget);
      const prefix = useRootScopedCommand ? "cd ../.. && " : "";
      const config = useRootScopedCommand ? "" : "../../";
      const target = useRootScopedCommand ? rootScopedTarget : ".";
      expect(packageScripts.format, file).toBeUndefined();
      expect(packageScripts["format:check"], file).toBe(
        `${prefix}oxfmt --list-different --config ${config}oxfmt.config.ts ${target}`,
      );
      expect(packageScripts["format:write"], file).toBe(
        `${prefix}oxfmt --write --config ${config}oxfmt.config.ts ${target}`,
      );
      expect(packageScripts.lint, file).toBe(
        `${prefix}oxlint --quiet --format=unix --type-aware --config ${config}oxlint.config.ts --no-error-on-unmatched-pattern ${target}`,
      );
      expect(packageScripts["lint:fix"], file).toBe(
        `${prefix}oxlint --fix --format=unix --type-aware --config ${config}oxlint.config.ts --no-error-on-unmatched-pattern ${target}`,
      );
    }
  });

  it("extends the daily graph with check:all without retaining wrapper behavior", () => {
    const scripts = readRootManifest().scripts ?? {};
    const checkAllSource = readFileSync(
      resolve(root, "scripts/check-all.ts"),
      "utf8",
    );
    expect(scripts["check:all"]).toContain("scripts/check-all.ts");
    expect(checkAllSource).toMatch(/integration|pglite|e2e|build|artifacts/i);
    expect(checkAllSource).toContain("test:artifacts");
    expect(scripts["test:artifacts"]).toContain("test:artifacts:verify");
    expect(scripts["test:artifacts:verify"]).toContain(
      "public-packages.test.ts",
    );
    for (const [name, command] of Object.entries(scripts)) {
      if (name === "test:artifacts:verify" || name === "check:all") continue;
      expect(command, name).not.toContain("public-packages.test.ts");
    }
  });

  it("keeps package tests discoverable through package-owned commands", () => {
    for (const file of workspacePackageFiles()) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const test = manifest.scripts?.test;
      if (!test || !test.includes("vitest")) continue;
      expect(manifest.scripts?.["test:unit"], file).toBeDefined();
      expect(test, file).not.toContain("../../vitest.config.ts");
      expect(test, file).not.toContain("--project=");

      const packageRoot = resolve(file, "..");
      const testFiles = packageTestFiles(packageRoot);
      const hasIntegrationTests = testFiles.some((path) =>
        path.endsWith(".test.ts"),
      );
      if (hasIntegrationTests) {
        expect(manifest.scripts?.["test:integration"], file).toBeDefined();
      }
    }
  });

  it("uses agent output for every package unit or integration task", () => {
    for (const file of workspacePackageFiles()) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as {
        scripts?: Record<string, string>;
      };
      for (const name of ["test:unit", "test:integration"] as const) {
        const script = manifest.scripts?.[name];
        if (script === undefined) continue;
        expect(script, `${file} ${name}`).toContain("--reporter=agent");
        expect(script, `${file} ${name}`).toContain("--silent=passed-only");
      }
    }
  });

  it("keeps the audited suffix inventory stable", () => {
    const workspaceTests = workspacePackageFiles().flatMap((file) =>
      packageTestFiles(resolve(file, "..")),
    );
    const rootTests = ["scripts", "tooling"].flatMap((directory) =>
      packageTestFiles(resolve(root, directory)),
    );
    const tests = [...workspaceTests, ...rootTests];

    expect(tests.filter((file) => file.endsWith(".spec.ts"))).toHaveLength(264);
    expect(tests.filter((file) => file.endsWith(".test.ts"))).toHaveLength(53);
  });

  it("discovers package unit and integration suites by suffix without services", () => {
    const manifest = JSON.parse(
      readFileSync(resolve(root, "packages/domain/package.json"), "utf8"),
    ) as { scripts?: Record<string, string> };
    const unit = manifest.scripts?.["test:unit"] ?? "";
    const integration = manifest.scripts?.["test:integration"] ?? "";
    const domainTests = packageTestFiles(resolve(root, "packages/domain"));

    expect(domainTests.some((file) => file.endsWith(".spec.ts"))).toBe(true);
    expect(domainTests.some((file) => file.endsWith(".test.ts"))).toBe(true);
    expect(unit).toContain("--exclude '**/*.test.ts'");
    expect(unit).not.toContain("--exclude '**/*.spec.ts'");
    expect(integration).toContain("--exclude '**/*.spec.ts'");
    expect(integration).not.toContain("--exclude '**/*.test.ts'");
  });
});
