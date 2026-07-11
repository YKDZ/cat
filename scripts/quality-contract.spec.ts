import { spawnSync } from "node:child_process";
import {
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
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
const readRootManifest = (): {
  scripts?: Record<string, string>;
} =>
  JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

describe("repository quality command contract", () => {
  it("keeps root checks explicit and removes the central Vitest registry", () => {
    const scripts = readRootManifest().scripts ?? {};

    expect(scripts.check).toBeDefined();
    expect(scripts["check:all"]).toBeDefined();
    expect(scripts.fix).toBeDefined();
    expect(scripts["pre" + "commit"]).toBeUndefined();
    expect(existsSync(resolve(root, "vitest.config.ts"))).toBe(false);
  });

  it("keeps check read-only and service-independent", () => {
    const scripts = readRootManifest().scripts ?? {};
    const check = scripts.check ?? "";

    expect(check).not.toMatch(/(?:fix|migrate|push|docker|playwright)/i);
    expect(check).toContain("pnpm format");
    expect(check).toContain("pnpm lint");
    expect(check).toContain("codegen:check");
    expect(check).toContain("test:unit");
    expect(check).toContain("test:tooling");
    expect(check).not.toMatch(/(?:^|&&)\s*pnpm test\s*(?:&&|$)/);
    expect(scripts.test).toBe("pnpm test:tooling");
    expect(scripts["test:tooling"]).toContain("scripts/vitest.config.ts");
    expect(
      readFileSync(resolve(root, "scripts/vitest.config.ts"), "utf8"),
    ).toMatch(/include:[\s\S]+\.spec\.ts/);
    expect(scripts["test:tooling"]).not.toContain("public-packages.test.ts");
  });

  it("makes pnpm check reject a root tooling formatting defect", () => {
    const probe = resolve(root, "scripts/quality-root-check-probe.ts");
    const before = "export const rootCheckProbe={value:1}\n";
    writeFileSync(probe, before);
    try {
      const result = spawnSync("pnpm", ["check"], {
        cwd: root,
        encoding: "utf8",
        timeout: 120_000,
      });

      expect(result.status, result.stderr).not.toBe(0);
      expect(readFileSync(probe, "utf8")).toBe(before);
    } finally {
      unlinkSync(probe);
    }
  });

  it("makes pnpm check reject a root tooling lint defect", () => {
    const probe = resolve(root, "scripts/quality-root-lint-probe.ts");
    const before = "export const rootLintProbe = (value: any): any => value;\n";
    writeFileSync(probe, before);
    try {
      const result = spawnSync("pnpm", ["check"], {
        cwd: root,
        encoding: "utf8",
        timeout: 120_000,
      });

      expect(result.status, result.stderr).not.toBe(0);
      expect(readFileSync(probe, "utf8")).toBe(before);
    } finally {
      unlinkSync(probe);
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

  it("does not mutate a worktree sentinel during formatter verification", () => {
    const sentinel = resolve(root, `.quality-check-sentinel-${process.pid}`);
    writeFileSync(sentinel, "untouched\n");
    try {
      const result = spawnSync("pnpm", ["format"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(result.status).toBe(0);
      expect(readFileSync(sentinel, "utf8")).toBe("untouched\n");
    } finally {
      unlinkSync(sentinel);
    }
  });

  it("fails on a package formatting defect without rewriting the package file", () => {
    const probe = resolve(
      root,
      "packages/shared/src/quality-package-format-probe.ts",
    );
    const before = "export const probe={value:1}\n";
    writeFileSync(probe, before);
    try {
      const result = spawnSync("pnpm", ["format"], {
        cwd: root,
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(readFileSync(probe, "utf8")).toBe(before);
    } finally {
      unlinkSync(probe);
    }
  });

  it("reserves mutation for fix and extends check for check:all", () => {
    const scripts = readRootManifest().scripts ?? {};
    const checkAllSource = readFileSync(
      resolve(root, "scripts/check-all.ts"),
      "utf8",
    );
    expect(scripts.fix).toMatch(/format:fix/);
    expect(scripts.fix).toMatch(/lint:fix/);
    expect(scripts.format).not.toMatch(/format:fix|lint:fix/);
    for (const file of workspacePackageFiles()) {
      const manifest = JSON.parse(readFileSync(file, "utf8")) as {
        scripts?: Record<string, string>;
      };
      const format = manifest.scripts?.format;
      if (format === undefined) continue;
      expect(format, file).not.toMatch(/format:fix|lint:fix/);
    }
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

    expect(tests.filter((file) => file.endsWith(".spec.ts"))).toHaveLength(233);
    expect(tests.filter((file) => file.endsWith(".test.ts"))).toHaveLength(49);
  });

  it("discovers package unit and integration suites by suffix without services", () => {
    const env = {
      ...process.env,
      DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/unreachable",
      REDIS_URL: "redis://127.0.0.1:1",
      TEST_DATABASE_URL: "postgresql://invalid:invalid@127.0.0.1:1/unreachable",
    };
    const unit = spawnSync(
      "pnpm",
      [
        "--filter",
        "@cat/domain",
        "exec",
        "vitest",
        "list",
        "--exclude",
        "**/*.test.ts",
      ],
      { cwd: root, encoding: "utf8", env },
    );
    const integration = spawnSync(
      "pnpm",
      [
        "--filter",
        "@cat/domain",
        "exec",
        "vitest",
        "list",
        "--exclude",
        "**/*.spec.ts",
      ],
      { cwd: root, encoding: "utf8", env },
    );

    expect(unit.status, unit.stderr).toBe(0);
    expect(unit.stdout).toContain(".spec.ts");
    expect(unit.stdout).not.toContain(".test.ts");
    expect(integration.status, integration.stderr).toBe(0);
    expect(integration.stdout).toContain(".test.ts");
    expect(integration.stdout).not.toContain(".spec.ts");
  });
});
