import { spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const fixtureRoots: string[] = [];

const createFixture = async (): Promise<string> => {
  const fixtureRoot = await mkdtemp(resolve(tmpdir(), "cat-oxc-cli-"));
  fixtureRoots.push(fixtureRoot);
  await Promise.all([
    cp(
      resolve(root, "oxlint.config.ts"),
      resolve(fixtureRoot, "oxlint.config.ts"),
    ),
    cp(
      resolve(root, "oxfmt.config.ts"),
      resolve(fixtureRoot, "oxfmt.config.ts"),
    ),
    cp(
      resolve(root, "tooling/oxlint"),
      resolve(fixtureRoot, "tooling/oxlint"),
      {
        recursive: true,
      },
    ),
    symlink(
      resolve(root, "node_modules"),
      resolve(fixtureRoot, "node_modules"),
    ),
    mkdir(resolve(fixtureRoot, "apps/app"), { recursive: true }).then(() =>
      symlink(
        resolve(root, "apps/app/node_modules"),
        resolve(fixtureRoot, "apps/app/node_modules"),
      ),
    ),
  ]);
  return fixtureRoot;
};

const writeFixture = async (
  fixtureRoot: string,
  relativePath: string,
  source: string,
): Promise<string> => {
  const path = resolve(fixtureRoot, relativePath);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, source);
  return path;
};

const runOxc = (executable: "oxfmt" | "oxlint", cwd: string, args: string[]) =>
  spawnSync(
    process.execPath,
    [resolve(root, "node_modules", executable, "bin", executable), ...args],
    {
      cwd,
      encoding: "utf8",
    },
  );

const outputOf = (result: ReturnType<typeof runOxc>): string =>
  `${result.stdout}${result.stderr}`;

afterEach(async () => {
  await Promise.all(
    fixtureRoots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true })),
  );
});

describe("direct Oxc commands", () => {
  it("applies client import restrictions to every root-scoped workspace", async () => {
    const fixtureRoot = await createFixture();
    for (const [path, source] of [
      ["apps/app/src/probe.client.ts", 'import "hono";\n'],
      ["apps/app/src/pages/probe/+guard.ts", 'import "#/server/ssc.ts";\n'],
      ["@cat-plugin/tiny-widget/src/probe.ts", 'import "hono";\n'],
      ["packages/plugin-core/src/client/probe.ts", 'import "hono";\n'],
      [
        "packages/ui/src/probe.vue",
        '<script setup lang="ts">\nimport "hono";\n</script>\n',
      ],
    ] as const) {
      await writeFixture(fixtureRoot, path, source);
      const result = runOxc("oxlint", fixtureRoot, [
        "--quiet",
        "--format=unix",
        "--type-aware",
        "--config",
        "oxlint.config.ts",
        path,
      ]);
      expect(result.status, path).not.toBe(0);
      expect(outputOf(result)).toContain("cat(no-server-import)");
    }
  });

  it("limits app client rules to client paths", async () => {
    const fixtureRoot = await createFixture();
    await writeFixture(
      fixtureRoot,
      "@cat-plugin/basic-tokenizer/probe.ts",
      'import "hono";\n',
    );

    const result = runOxc("oxlint", fixtureRoot, [
      "--quiet",
      "--format=unix",
      "--type-aware",
      "--config",
      "oxlint.config.ts",
      "@cat-plugin/basic-tokenizer/probe.ts",
    ]);

    expect(result.status).toBe(0);
    expect(outputOf(result)).not.toContain("cat(no-server-import)");
  });

  it("keeps advisory warnings visible to lint:fix without failing", async () => {
    const fixtureRoot = await createFixture();
    await writeFixture(
      fixtureRoot,
      "@cat-plugin/basic-tokenizer/warning.ts",
      'export const warningProbe = JSON.parse("{}").missing();\n',
    );

    const result = runOxc("oxlint", fixtureRoot, [
      "--fix",
      "--format=unix",
      "--type-aware",
      "--config",
      "oxlint.config.ts",
      "@cat-plugin/basic-tokenizer/warning.ts",
    ]);

    expect(result.status).toBe(0);
    expect(outputOf(result)).toMatch(
      /typescript\(no-unsafe-(call|member-access)\)/,
    );
  });

  it("reports type-aware promise contract errors", async () => {
    const fixtureRoot = await createFixture();
    await writeFixture(
      fixtureRoot,
      "@cat-plugin/basic-tokenizer/promise.ts",
      [
        "const runNow = (callback: () => void) => callback();",
        "runNow(async () => {",
        "  await Promise.resolve();",
        "});",
        "",
      ].join("\n"),
    );

    const result = runOxc("oxlint", fixtureRoot, [
      "--quiet",
      "--format=unix",
      "--type-aware",
      "--config",
      "oxlint.config.ts",
      "@cat-plugin/basic-tokenizer/promise.ts",
    ]);

    expect(result.status).not.toBe(0);
    expect(outputOf(result)).toContain("typescript(no-misused-promises)");
  });

  it("allows type-only server imports but rejects value import forms", async () => {
    const fixtureRoot = await createFixture();
    await writeFixture(
      fixtureRoot,
      "apps/app/src/type-only.client.ts",
      [
        'import type { Context } from "hono";',
        'import { type Hono } from "hono";',
        'export { type Context as ExportedContext } from "hono";',
        "export type Probe = Context | Hono;",
        "",
      ].join("\n"),
    );
    const typeOnly = runOxc("oxlint", fixtureRoot, [
      "--quiet",
      "--format=unix",
      "--type-aware",
      "--config",
      "oxlint.config.ts",
      "apps/app/src/type-only.client.ts",
    ]);
    expect(typeOnly.status).toBe(0);

    for (const [path, source] of [
      [
        "apps/app/src/mixed.client.ts",
        'import { type Context, Hono } from "hono";\nexport const probe = new Hono<Context>();\n',
      ],
      [
        "apps/app/src/dynamic.client.ts",
        'export const probe = () => import("hono");\n',
      ],
      [
        "apps/app/src/require.client.ts",
        'export const probe = require("hono");\n',
      ],
      [
        "apps/app/src/import-equals.client.ts",
        'import ServerModule = require("hono");\nexport { ServerModule };\n',
      ],
    ] as const) {
      await writeFixture(fixtureRoot, path, source);
      const result = runOxc("oxlint", fixtureRoot, [
        "--quiet",
        "--format=unix",
        "--type-aware",
        "--config",
        "oxlint.config.ts",
        path,
      ]);
      expect(result.status, path).not.toBe(0);
      expect(outputOf(result)).toContain("cat(no-server-import)");
    }
  });

  it("runs a filtered plugin lint task without a bootstrap build", () => {
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

    expect(result.status).toBe(0);
    expect(outputOf(result)).toContain("@cat-plugin/basic-tokenizer:lint");
    expect(outputOf(result)).not.toMatch(/@cat-plugin\/basic-tokenizer:build/);
  });

  it("checks maintained source with Oxfmt and leaves generated schema files unchanged", async () => {
    const fixtureRoot = await createFixture();
    await writeFixture(
      fixtureRoot,
      "packages/ui/src/components/probe.ts",
      "export const probe={value:1}\n",
    );
    await writeFixture(
      fixtureRoot,
      "packages/shared/src/schema/drizzle/generated.ts",
      "export const generated={value:1}\n",
    );

    const formatCheck = runOxc("oxfmt", fixtureRoot, [
      "--list-different",
      "--config",
      "oxfmt.config.ts",
      "packages/ui/src/components/probe.ts",
    ]);
    const generatedBefore = await readFile(
      resolve(fixtureRoot, "packages/shared/src/schema/drizzle/generated.ts"),
      "utf8",
    );
    const formatGenerated = runOxc("oxfmt", fixtureRoot, [
      "--write",
      "--config",
      "oxfmt.config.ts",
      "packages/shared/src/schema/drizzle/generated.ts",
      "packages/ui/src/components/probe.ts",
    ]);

    expect(formatCheck.status).not.toBe(0);
    expect(outputOf(formatCheck)).toContain(
      "packages/ui/src/components/probe.ts",
    );
    expect(formatGenerated.status).toBe(0);
    await expect(
      readFile(
        resolve(fixtureRoot, "packages/shared/src/schema/drizzle/generated.ts"),
        "utf8",
      ),
    ).resolves.toBe(generatedBefore);
  });
});
