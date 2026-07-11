import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const runner = resolve(root, "tooling/oxlint/run.ts");
const createdFixtures: string[] = [];

const createFixture = (relativePath: string, source: string): string => {
  const path = resolve(root, relativePath);
  writeFileSync(path, source);
  createdFixtures.push(path);
  return path;
};

const runQuality = (
  cwd: string,
  mode: "lint" | "format" | "format:fix",
  ...targets: string[]
) =>
  spawnSync(process.execPath, [runner, mode, ...targets], {
    cwd,
    encoding: "utf8",
  });

afterEach(() => {
  for (const fixture of createdFixtures.splice(0)) {
    rmSync(fixture, { force: true });
  }
});

describe("root OXC command", () => {
  it("applies app client overrides from root and package working directories", () => {
    createFixture("apps/app/src/oxc-cwd-probe.client.ts", 'import "hono";\n');

    const fromRoot = runQuality(
      root,
      "lint",
      "apps/app/src/oxc-cwd-probe.client.ts",
    );
    const fromPackage = runQuality(
      resolve(root, "apps/app"),
      "lint",
      "src/oxc-cwd-probe.client.ts",
    );

    for (const result of [fromRoot, fromPackage]) {
      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "cat(no-server-import)",
      );
    }
  });

  it("does not apply app client rules to plugin build files", () => {
    createFixture(
      "@cat-plugin/basic-tokenizer/oxc-build-probe.ts",
      'import "hono";\n',
    );

    const result = runQuality(
      resolve(root, "@cat-plugin/basic-tokenizer"),
      "lint",
      "oxc-build-probe.ts",
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      "cat(no-server-import)",
    );

    const tinyWidgetResult = runQuality(
      resolve(root, "@cat-plugin/tiny-widget"),
      "lint",
      "vite.config.ts",
    );
    expect(tinyWidgetResult.status).toBe(0);
    expect(
      `${tinyWidgetResult.stdout}${tinyWidgetResult.stderr}`,
    ).not.toContain("cat(no-server-import)");
  });

  it("reports unsafe-type warnings without failing the command", () => {
    createFixture(
      "@cat-plugin/basic-tokenizer/oxc-warning-probe.ts",
      'export const warningProbe = JSON.parse("{}").missing();\n',
    );

    const result = runQuality(
      resolve(root, "@cat-plugin/basic-tokenizer"),
      "lint",
      "oxc-warning-probe.ts",
    );
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toMatch(/typescript\(no-unsafe-(call|member-access)\)/);
  });

  it("fails when a promise-returning callback is passed to a void contract", () => {
    createFixture(
      "@cat-plugin/basic-tokenizer/oxc-misused-promise-probe.ts",
      [
        "const runNow = (callback: () => void) => callback();",
        "runNow(async () => {",
        "  await Promise.resolve();",
        "});",
        "",
      ].join("\n"),
    );

    const result = runQuality(
      resolve(root, "@cat-plugin/basic-tokenizer"),
      "lint",
      "oxc-misused-promise-probe.ts",
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain(
      "typescript(no-misused-promises)",
    );
  });

  it("allows declaration and inline type-only server imports", () => {
    createFixture(
      "apps/app/src/oxc-type-import-probe.client.ts",
      [
        'import type { Context } from "hono";',
        'import { type Hono } from "hono";',
        'export { type Context as ExportedContext } from "hono";',
        "export type Probe = Context | Hono;",
        "",
      ].join("\n"),
    );

    const result = runQuality(
      resolve(root, "apps/app"),
      "lint",
      "src/oxc-type-import-probe.client.ts",
    );

    expect(result.status).toBe(0);
    expect(`${result.stdout}${result.stderr}`).not.toContain(
      "cat(no-server-import)",
    );
  });

  it("rejects mixed, dynamic, and CommonJS server imports", () => {
    const probes = [
      [
        "apps/app/src/oxc-mixed-import-probe.client.ts",
        'import { type Context, Hono } from "hono";\nexport const probe = new Hono<Context>();\n',
      ],
      [
        "apps/app/src/oxc-dynamic-import-probe.client.ts",
        'export const probe = () => import("hono");\n',
      ],
      [
        "apps/app/src/oxc-require-probe.client.ts",
        'export const probe = require("hono");\n',
      ],
      [
        "apps/app/src/oxc-import-equals-probe.client.ts",
        'import ServerModule = require("hono");\nexport { ServerModule };\n',
      ],
    ] as const;

    for (const [relativePath, source] of probes) {
      createFixture(relativePath, source);
      const result = runQuality(root, "lint", relativePath);

      expect(result.status).not.toBe(0);
      expect(`${result.stdout}${result.stderr}`).toContain(
        "cat(no-server-import)",
      );
    }
  });

  it("executes a filtered plugin lint task without a bootstrap build", () => {
    const result = spawnSync(
      "pnpm",
      [
        "turbo",
        "run",
        "lint",
        "--filter=@cat-plugin/basic-tokenizer",
        "--force",
      ],
      { cwd: root, encoding: "utf8" },
    );
    const output = `${result.stdout}${result.stderr}`;

    expect(result.status).toBe(0);
    expect(output).toContain("@cat-plugin/basic-tokenizer:lint");
    expect(output).not.toMatch(/@cat-plugin\/basic-tokenizer:build/);
  });

  it("checks maintained UI component source with Oxfmt", () => {
    createFixture(
      "packages/ui/src/components/oxc-format-probe.ts",
      "export const probe={value:1}\n",
    );

    const result = runQuality(
      resolve(root, "packages/ui"),
      "format",
      "src/components/oxc-format-probe.ts",
    );

    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("oxc-format-probe.ts");
  });

  it("leaves generated schemas unchanged in formatter write mode", () => {
    const fixture = createFixture(
      "packages/shared/src/schema/drizzle/oxc-generated-format-probe.ts",
      "export const probe={value:1}\n",
    );
    const before = readFileSync(fixture, "utf8");

    const result = runQuality(
      resolve(root, "packages/shared"),
      "format:fix",
      "src/schema/drizzle/oxc-generated-format-probe.ts",
    );

    expect(result.status).toBe(0);
    expect(readFileSync(fixture, "utf8")).toBe(before);
  });
});
