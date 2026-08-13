import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { loadWorkspacePackages } from "./workspace-boundaries.ts";

const root = resolve(import.meta.dirname, "..");

type PackageManifest = {
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};
type TypeScriptConfig = {
  compilerOptions?: Record<string, unknown>;
  extends?: string | string[];
  files?: string[];
  references?: Array<{ path: string }>;
};

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(resolve(root, path), "utf8")) as T;

const repositoryFiles = (): string[] =>
  execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard"],
    { cwd: root, encoding: "utf8" },
  )
    .split("\n")
    .filter(Boolean)
    .filter((path) => existsSync(resolve(root, path)));

const tsconfigFiles = (): string[] =>
  repositoryFiles()
    .filter((path) => /(^|\/)tsconfig(?:\.[^/]+)?\.json$/u.test(path))
    .sort();

const showConfig = (path: string): TypeScriptConfig => {
  const output = execFileSync(
    "pnpm",
    ["--workspace-root", "exec", "tsc", "--showConfig", "-p", path],
    { cwd: root, encoding: "utf8" },
  );
  return JSON.parse(output) as TypeScriptConfig;
};

const packageRoots = (): Array<{
  manifest: PackageManifest;
  root: string;
}> => [
  {
    manifest: readJson<PackageManifest>("package.json"),
    root: ".",
  },
  ...loadWorkspacePackages(root).map(({ manifestPath, manifest }) => ({
    manifest: manifest as PackageManifest,
    root: relative(root, dirname(manifestPath)),
  })),
];

const owningPackage = (
  path: string,
  packages: ReturnType<typeof packageRoots>,
) =>
  packages
    .filter(
      ({ root: packageRoot }) =>
        packageRoot === "." ||
        path === packageRoot ||
        path.startsWith(`${packageRoot}/`),
    )
    .sort((left, right) => right.root.length - left.root.length)[0];

describe("TypeScript configuration contracts", () => {
  it("keeps one root config and delegates reusable policy to the private package", () => {
    expect(tsconfigFiles().filter((path) => !path.includes("/"))).toEqual([
      "tsconfig.json",
    ]);

    const manifest = readJson<{
      files: string[];
      name: string;
      private: boolean;
    }>("packages/typescript-config/package.json");
    expect(manifest).toMatchObject({
      files: ["base.json", "bundler.json", "declaration.json", "node.json"],
      name: "@cat/typescript-config",
      private: true,
    });
  });

  it("applies the strict shared policy through effective TS7 configs", () => {
    const node = showConfig("tsconfig.json").compilerOptions;
    const bundler = showConfig("packages/shared/tsconfig.json").compilerOptions;
    const declaration = showConfig(
      "packages/plugin-core/tsconfig.lib.json",
    ).compilerOptions;

    expect(node).toMatchObject({
      allowUnreachableCode: false,
      allowUnusedLabels: false,
      erasableSyntaxOnly: true,
      exactOptionalPropertyTypes: true,
      module: "nodenext",
      moduleResolution: "nodenext",
      noUncheckedIndexedAccess: true,
      noUncheckedSideEffectImports: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      skipLibCheck: true,
      strict: true,
      target: "es2023",
      verbatimModuleSyntax: true,
    });
    expect(node).not.toHaveProperty("noPropertyAccessFromIndexSignature");
    expect(bundler).toMatchObject({
      module: "esnext",
      moduleResolution: "bundler",
      noEmit: true,
      target: "es2023",
    });
    expect(declaration).toMatchObject({
      declaration: true,
      emitDeclarationOnly: true,
      isolatedDeclarations: true,
      noEmit: false,
    });
  });

  it("keeps runtime concerns out of the base and forbids strictness opt-outs", () => {
    const base = readJson<TypeScriptConfig>(
      "packages/typescript-config/base.json",
    ).compilerOptions;
    for (const option of [
      "allowImportingTsExtensions",
      "customConditions",
      "declaration",
      "emitDeclarationOnly",
      "lib",
      "module",
      "moduleResolution",
      "noEmit",
      "target",
      "types",
    ]) {
      expect(base, option).not.toHaveProperty(option);
    }

    const requiredValues = {
      allowUnreachableCode: false,
      allowUnusedLabels: false,
      erasableSyntaxOnly: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noUncheckedSideEffectImports: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      skipLibCheck: true,
      strict: true,
      verbatimModuleSyntax: true,
    } as const;
    const failures: string[] = [];
    for (const path of tsconfigFiles()) {
      if (path.startsWith("packages/typescript-config/")) continue;
      const options = readJson<TypeScriptConfig>(path).compilerOptions;
      for (const [option, required] of Object.entries(requiredValues)) {
        if (options?.[option] !== undefined && options[option] !== required) {
          failures.push(`${path}: ${option} overrides shared policy`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it("checks root-owned tooling without crossing into package configuration", () => {
    const files = showConfig("tsconfig.json").files ?? [];
    expect(files).toEqual(
      expect.arrayContaining([
        "./oxlint.config.ts",
        "./scripts/verification-local.ts",
        "./scripts/typescript-config-contract.spec.ts",
      ]),
    );
    expect(files.some((path) => path.endsWith("drizzle.config.ts"))).toBe(
      false,
    );
  });

  it("requires every config consumer to declare the shared package directly", () => {
    const packages = packageRoots();
    const failures = tsconfigFiles().flatMap((path) => {
      if (path.startsWith("packages/typescript-config/")) return [];
      const owner = owningPackage(path, packages);
      if (
        owner?.manifest.devDependencies?.["@cat/typescript-config"] !==
        undefined
      ) {
        return [];
      }
      return [`${path}: missing @cat/typescript-config devDependency`];
    });

    expect(failures).toEqual([]);
  });

  it("keeps project references package-local and removes compiler aliases", () => {
    const packages = packageRoots();
    const failures: string[] = [];

    for (const path of tsconfigFiles()) {
      const config = readJson<TypeScriptConfig>(path);
      if (config.compilerOptions?.paths !== undefined) {
        failures.push(`${path}: compilerOptions.paths is forbidden`);
      }
      const owner = owningPackage(path, packages);
      if (owner === undefined) {
        failures.push(`${path}: no owning package`);
        continue;
      }
      const ownerRoot = resolve(root, owner.root);
      for (const reference of config.references ?? []) {
        const target = resolve(root, dirname(path), reference.path);
        const relativeTarget = relative(ownerRoot, target);
        if (relativeTarget === ".." || relativeTarget.startsWith(`..${sep}`)) {
          failures.push(`${path}: cross-package reference ${reference.path}`);
        }
      }
    }

    const sourceAliasImports = repositoryFiles().flatMap((path) => {
      if (!/\.(?:js|mjs|ts|tsx|vue)$/u.test(path)) return [];
      const content = readFileSync(resolve(root, path), "utf8");
      return /(?:from\s+|import\()["']@\//u.test(content)
        ? [`${path}: @/ import alias`]
        : [];
    });

    expect([...failures, ...sourceAliasImports]).toEqual([]);
  });

  it("keeps application and plugin solution ownership explicit", () => {
    expect(
      readJson<TypeScriptConfig>("apps/app/tsconfig.json").references,
    ).toEqual([
      { path: "./tsconfig.app.json" },
      { path: "./tsconfig.node.json" },
      { path: "./tsconfig.test.json" },
    ]);

    for (const { root: packageRoot } of packageRoots().filter(({ root }) =>
      root.startsWith("@cat-plugin/"),
    )) {
      const config = readJson<TypeScriptConfig>(`${packageRoot}/tsconfig.json`);
      const references = config.references?.map(({ path }) => path) ?? [];
      expect(references, packageRoot).toContain("./tsconfig.app.json");
      expect(
        tsconfigFiles().filter((path) =>
          /^tsconfig\.(?:build|declaration|lib)\.json$/u.test(
            path.slice(`${packageRoot}/`.length),
          ),
        ),
        packageRoot,
      ).toEqual([]);

      const hasTests = repositoryFiles().some(
        (path) =>
          path.startsWith(`${packageRoot}/`) &&
          /\.(?:spec|test)\.(?:ts|tsx)$/u.test(path),
      );
      expect(references.includes("./tsconfig.spec.json"), packageRoot).toBe(
        hasTests,
      );
    }
  });

  it("separates application production and test ambient types", () => {
    const application = showConfig("apps/app/tsconfig.app.json").compilerOptions
      ?.types;
    const test = showConfig("apps/app/tsconfig.test.json").compilerOptions
      ?.types;
    expect(application).toEqual(["node", "vite/client"]);
    expect(test).toEqual(
      expect.arrayContaining(["vitest/globals", "vitest/importMeta"]),
    );
  });

  it("uses TS7 as the primary checker and vue-tsc only as a Vue supplement", () => {
    for (const { manifest, root: packageRoot } of packageRoots()) {
      const typecheck = manifest.scripts?.typecheck;
      if (typecheck === undefined) continue;
      expect(typecheck, packageRoot).toContain("--pretty false");
      if (typecheck.includes("vue-tsc")) {
        expect(typecheck, packageRoot).toMatch(
          /tsc --build .+ --noEmit --pretty false && vue-tsc --noEmit --pretty false -p tsconfig(?:\.app)?\.json/u,
        );
      }
    }
  });
});
