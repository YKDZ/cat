#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type GenerateRoutesOptions = {
  outputFile?: string;
  resolvePackageExport?: (specifier: string) => string;
};

export type GenerateRoutesResult = {
  direct: number;
  nested: number;
  total: number;
};

export const generateRoutes = ({
  outputFile = resolve(import.meta.dirname, "../src/routes.generated.ts"),
  resolvePackageExport = (specifier) => import.meta.resolve(specifier),
}: GenerateRoutesOptions = {}): GenerateRoutesResult => {
  const routerFile = fileURLToPath(
    resolvePackageExport("@cat/app-api/orpc/router"),
  );

  // Parse the root router to find each namespace's exported module.

  const routerSource = readFileSync(routerFile, "utf-8");
  const routerDir = dirname(routerFile);

  // Match: import * as <namespace> from "<relative-path>";
  const importRegex = /import\s+\*\s+as\s+(\w+)\s+from\s+"([^"]+)"/g;

  type NamespaceMapping = { namespace: string; filePath: string };
  const namespaces: NamespaceMapping[] = [];

  let importMatch: RegExpExecArray | null;
  while ((importMatch = importRegex.exec(routerSource)) !== null) {
    const [, namespace, relPath] = importMatch;
    if (!namespace || !relPath) continue;

    // Resolve the actual file path (handle .ts extension and index files)
    let filePath = resolve(routerDir, relPath);
    if (!filePath.endsWith(".ts")) filePath += ".ts";
    namespaces.push({ namespace, filePath });
  }

  // ── Step 2: Extract exports from each module ────────────────────────

  type RouteEntry = {
    path: string;
    /** Whether this is from a nested object export (e.g., glossaryRouter.X) */
    nested: boolean;
  };

  /**
   * Extract `export const <name>` declarations from a source file.
   * Returns tuples of [name, isObjectLiteral].
   */
  const extractExportConsts = (
    source: string,
  ): { name: string; isObject: boolean }[] => {
    const results: { name: string; isObject: boolean }[] = [];
    // Match: export const <name> = ...
    // Capture the first non-whitespace token after '=' to determine type
    const re = /export\s+const\s+(\w+)\s*=\s*(\S)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const name = m[1];
      const firstChar = m[2];
      if (!name || !firstChar) continue;
      results.push({ name, isObject: firstChar === "{" });
    }
    return results;
  };

  /**
   * Extract `export { name1, name2 as alias } from "..."` re-exports.
   * Returns the exported (possibly aliased) names.
   */
  const extractReExports = (source: string): string[] => {
    const results: string[] = [];
    const re = /export\s*\{([^}]+)\}\s*from/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const names = m[1];
      if (!names) continue;
      for (const part of names.split(",")) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        // "originalName as aliasName" → take aliasName
        const asMatch = /\s+as\s+(\w+)/.exec(trimmed);
        results.push(asMatch?.[1] ?? trimmed);
      }
    }
    return results;
  };

  /**
   * Extract keys from a plain object literal (the one starting right after `= {`).
   * Handles simple cases: `{ key1, key2, key3: value }`.
   */
  const extractObjectKeys = (source: string, objectName: string): string[] => {
    // Find the object literal definition: `export const <objectName> = {`
    const pattern = new RegExp(
      `export\\s+const\\s+${objectName}\\s*=\\s*\\{([^}]+)\\}`,
      "s",
    );
    const m = pattern.exec(source);
    if (!m?.[1]) return [];

    const body = m[1];
    const keys: string[] = [];
    // Match both `key,` and `key: value,` patterns
    const keyRe = /(\w+)\s*(?:[:,}])/g;
    let km: RegExpExecArray | null;
    while ((km = keyRe.exec(body)) !== null) {
      if (km[1]) keys.push(km[1]);
    }
    return keys;
  };

  // ── Step 3: Build the route list ────────────────────────────────────

  const routes: RouteEntry[] = [];

  for (const { namespace, filePath } of namespaces) {
    let source: string;
    try {
      source = readFileSync(filePath, "utf-8");
    } catch {
      // oxlint-disable-next-line no-console
      console.warn(
        `[WARN] Cannot read ${filePath}, skipping namespace '${namespace}'`,
      );
      continue;
    }

    // Direct `export const` declarations
    const consts = extractExportConsts(source);
    for (const { name, isObject } of consts) {
      if (isObject) {
        // Nested object → extract its keys as sub-paths
        const keys = extractObjectKeys(source, name);
        for (const key of keys) {
          routes.push({ path: `${namespace}.${name}.${key}`, nested: true });
        }
      } else {
        routes.push({ path: `${namespace}.${name}`, nested: false });
      }
    }

    // Re-exports: `export { X, Y } from "..."`
    const reExports = extractReExports(source);
    for (const name of reExports) {
      routes.push({ path: `${namespace}.${name}`, nested: false });
    }
  }

  // Sort: direct paths first, then nested, alphabetically within each group
  routes.sort((a, b) => {
    if (a.nested !== b.nested) return a.nested ? 1 : -1;
    return a.path.localeCompare(b.path);
  });

  // ── Step 4: Generate the output file ────────────────────────────────

  const directRoutes = routes.filter((r) => !r.nested);
  const nestedRoutes = routes.filter((r) => r.nested);

  const allPaths = routes.map((r) => r.path);
  const directPaths = directRoutes.map((r) => r.path);

  const output = `\
// AUTO-GENERATED by apps/cli/scripts/generate-routes.ts - do not edit manually.
// Re-generate with: pnpm --filter @cat/cli generate:routes

/**
 * All callable oRPC endpoint paths, including nested router sub-paths.
 */
export const ALL_ROUTES = ${JSON.stringify(allPaths, null, 2)} as const;

/**
 * Directly exported endpoint paths, excluding nested router aliases.
 */
export const ROUTES = ${JSON.stringify(directPaths, null, 2)} as const;

export type RoutePath = (typeof ROUTES)[number];
export type AnyRoutePath = (typeof ALL_ROUTES)[number];
`;

  writeFileSync(outputFile, output, "utf-8");

  return {
    direct: directPaths.length,
    nested: nestedRoutes.length,
    total: allPaths.length,
  };
};

const isDirectExecution =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === resolve(import.meta.filename);

if (isDirectExecution) {
  const result = generateRoutes();

  // oxlint-disable-next-line no-console
  console.log(
    `Generated CLI routes: ${result.direct} direct, ${result.nested} nested, ${result.total} total`,
  );
}
