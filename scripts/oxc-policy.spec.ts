import { existsSync, globSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import oxfmtConfig from "../oxfmt.config.ts";
import oxlintConfig from "../oxlint.config.ts";

const root = resolve(import.meta.dirname, "..");

describe("root OXC policy", () => {
  it("keeps correctness strict and suspicious diagnostics visible", () => {
    expect(oxlintConfig.categories).toMatchObject({
      correctness: "error",
      suspicious: "warn",
    });
    expect(oxlintConfig.rules).toMatchObject({
      "promise/catch-or-return": "error",
      "typescript/no-misused-promises": "error",
      "typescript/switch-exhaustiveness-check": "error",
      "typescript/no-deprecated": "error",
      "typescript/no-explicit-any": "error",
      "typescript/no-unsafe-call": "warn",
      "typescript/no-unsafe-member-access": "warn",
      "typescript/no-unsafe-return": "warn",
    });
    expect(oxlintConfig.categories).not.toHaveProperty("style");
    expect(oxlintConfig.categories).not.toHaveProperty("restriction");
    expect(oxlintConfig.categories).not.toHaveProperty("pedantic");
    expect(oxlintConfig.categories).not.toHaveProperty("nursery");
    expect(oxlintConfig.options).toMatchObject({ typeAware: true });
  });

  it("loads the client architecture rule from root TypeScript tooling", () => {
    expect(oxlintConfig.jsPlugins).toContain("./tooling/oxlint/cat-plugin.ts");
    const clientOverride = oxlintConfig.overrides?.find((override) =>
      override.files?.some((file) => file.includes("*.vue")),
    );
    expect(clientOverride?.rules).toHaveProperty("cat/no-server-import");
    expect(clientOverride?.env).toMatchObject({ browser: true, node: false });
    expect(existsSync(resolve(root, "tooling/oxlint/cat-plugin.ts"))).toBe(
      true,
    );
  });

  it("uses standard formatter sorting while excluding generated sources", () => {
    expect(oxfmtConfig.printWidth).toBe(80);
    expect(oxfmtConfig.sortImports).toBeDefined();
    expect(oxfmtConfig.sortImports).not.toHaveProperty("groups");
    expect(oxfmtConfig.sortPackageJson).toMatchObject({ sortScripts: true });
    expect(oxfmtConfig.sortTailwindcss).toBeDefined();
    expect(oxfmtConfig.ignorePatterns).toEqual(
      expect.arrayContaining([
        expect.stringContaining("drizzle"),
        expect.stringContaining("migrations"),
        expect.stringContaining("schema"),
      ]),
    );
    expect(oxfmtConfig.ignorePatterns).not.toContain(
      "packages/ui/src/components",
    );
  });

  it("does not leave package-local configs or a bootstrap plugin package", () => {
    expect(
      globSync("**/oxlint.config.ts", {
        cwd: root,
        exclude: (path) => path.includes("node_modules"),
      }),
    ).toEqual(["oxlint.config.ts"]);
    expect(
      readFileSync(resolve(root, "pnpm-workspace.yaml"), "utf8"),
    ).not.toContain("packages/oxlint-plugin");
    expect(
      existsSync(resolve(root, "packages/oxlint-plugin/package.json")),
    ).toBe(false);
  });

  it("gives every active workspace package root-owned quality tasks", () => {
    const manifests = globSync(
      [
        "apps/*/package.json",
        "packages/*/package.json",
        "@cat-plugin/*/package.json",
        "tools/*/package.json",
      ],
      { cwd: root },
    );

    expect(manifests).toHaveLength(44);
    for (const manifest of manifests) {
      const packageJson = JSON.parse(
        readFileSync(resolve(root, manifest), "utf8"),
      ) as { scripts?: Record<string, string> };
      expect(packageJson.scripts?.["lint"], manifest).toBe(
        "node ../../tooling/oxlint/run.ts lint",
      );
      expect(packageJson.scripts?.["format"], manifest).toBe(
        "node ../../tooling/oxlint/run.ts format",
      );
    }
  });
});
