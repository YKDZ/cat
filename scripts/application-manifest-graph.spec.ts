import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

type Manifest = {
  private?: boolean;
  imports?: Record<string, string>;
  exports?: unknown;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

const workspaceRoot = process.cwd();
const migratedRoots = [
  "packages/app-api",
  "apps/app",
  "apps/cli",
  "apps/eval",
  "apps/app-e2e",
  "packages/seed",
  "tools/seeder",
];

const readJson = <T>(path: string): T =>
  JSON.parse(readFileSync(join(workspaceRoot, path), "utf8")) as T;

const ignoredDirectories = new Set([
  ".turbo",
  "dist",
  "node_modules",
  "out-tsc",
]);

const listFiles = (root: string): string[] => {
  const files: string[] = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    for (const entry of readdirSync(join(workspaceRoot, directory), {
      withFileTypes: true,
    })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory() && !ignoredDirectories.has(entry.name)) {
        directories.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }
  return files.sort();
};

const sourceExport = (value: unknown): boolean => {
  if (typeof value === "string") {
    return value.endsWith(".ts") && !value.endsWith(".d.ts");
  }
  if (value === null || typeof value !== "object") return false;
  return Object.values(value).some(sourceExport);
};

describe("application manifest graph", () => {
  it("owns the private application API as a source package", () => {
    expect(existsSync(join(workspaceRoot, ["apps", "app-api"].join("/")))).toBe(
      false,
    );
    const manifest = readJson<Manifest>("packages/app-api/package.json");

    expect(manifest.private).toBe(true);
    expect(manifest.imports).toEqual({ "#/*": "./src/*" });
    expect(sourceExport(manifest.exports)).toBe(true);
    expect(manifest.peerDependencies).toBeUndefined();
  });

  it("declares migrated internal runtime edges as source links", () => {
    for (const root of migratedRoots) {
      const manifest = readJson<Manifest>(join(root, "package.json"));
      for (const [name, specifier] of Object.entries(
        manifest.dependencies ?? {},
      )) {
        if (!name.startsWith("@cat/")) continue;
        expect(
          specifier.startsWith("link:"),
          `${root} must link runtime dependency ${name}`,
        ).toBe(true);
      }
    }
  });

  it("uses one alias-free validation config per migrated workspace", () => {
    for (const root of migratedRoots) {
      const configs = listFiles(root).filter((path) =>
        /(^|\/)tsconfig(?:\.[^/]+)?\.json$/.test(path),
      );
      expect(configs, root).toEqual([join(root, "tsconfig.json")]);

      const config = readFileSync(join(workspaceRoot, configs[0]!), "utf8");
      expect(config, `${root} paths`).not.toMatch(/"paths"/);
      expect(config, `${root} references`).not.toMatch(/"references"/);
    }
  });

  it("uses package imports instead of TypeScript path aliases", () => {
    const offenders = migratedRoots.flatMap((root) =>
      listFiles(root)
        .filter((path) => /\.(?:ts|vue)$/.test(path))
        .filter((path) =>
          readFileSync(join(workspaceRoot, path), "utf8").includes('"@/'),
        ),
    );

    expect(offenders.map((path) => relative(workspaceRoot, path))).toEqual([]);
  });

  it("owns Turbo tasks and direct Node maintenance commands in manifests", () => {
    for (const root of migratedRoots) {
      const manifest = readJson<Manifest>(join(root, "package.json"));
      expect(
        manifest.scripts?.["format:check"],
        `${root} format:check`,
      ).toBeDefined();
      expect(
        manifest.scripts?.["format:write"],
        `${root} format:write`,
      ).toBeDefined();
      expect(manifest.scripts?.lint, `${root} lint`).toBeDefined();
      expect(manifest.scripts?.typecheck, `${root} typecheck`).toBeDefined();

      const commands = Object.values(manifest.scripts ?? {}).join("\n");
      expect(commands, `${root} tsx`).not.toMatch(/(?:^|\s)tsx(?:\s|$)/);
      expect(commands, `${root} generic watch`).not.toMatch(/\bwatch\b/);
    }
  });

  it("does not retain private application or data-package prebuilds", () => {
    for (const root of ["packages/app-api", "packages/seed"]) {
      expect(existsSync(join(workspaceRoot, root, "vite.config.ts"))).toBe(
        false,
      );
      const manifest = readJson<Manifest>(join(root, "package.json"));
      expect(manifest.scripts?.build).toBeUndefined();
      expect(
        manifest.devDependencies?.[["unplugin", "dts"].join("-")],
      ).toBeUndefined();
      expect(manifest.devDependencies?.vite).toBeUndefined();
    }
  });
});
