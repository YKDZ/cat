/**
 * verify-root-contract.ts
 *
 * Validates the built @cat/shared output against the public contract:
 *   1. Canonical names are present in dist/index.js.
 *   2. Deprecated / non-isomorphic names are absent.
 *   3. Every dist/compat/<subpath>.js only re-exports names from dist/index.js.
 *   4. dist/index.d.ts is non-trivial and contains expected symbols.
 *
 * Run: pnpm tsx packages/shared/scripts/verify-root-contract.ts
 * (Requires a prior `shared:build` run.)
 */
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

const DIST = path.resolve(import.meta.dirname, "../dist");
const PKG_PATH = path.resolve(import.meta.dirname, "../package.json");

// ─── Expected canonical names ─────────────────────────────────────────────

const MUST_EXIST = [
  "AgentDefinitionMetadataSchema",
  "StoredAgentDefinitionSchema",
  "PermissionCheckSchema",
  "sanitizeFileName",
];

const MUST_NOT_EXIST = [
  "AgentDefinitionSchema",
  "AgentDefinition",
  "BlobSchema",
  "Blob",
];

// ─── Load root exports ────────────────────────────────────────────────────

const rootIndexPath = path.join(DIST, "index.js");
assert.ok(
  fs.existsSync(rootIndexPath),
  `dist/index.js not found — run shared:build first`,
);

const rootExports = (await import(pathToFileURL(rootIndexPath).href)) as Record<
  string,
  unknown
>;
const rootKeys = new Set(Object.keys(rootExports));

// ─── Canonical presence / absence checks ─────────────────────────────────

for (const name of MUST_EXIST) {
  assert.ok(rootKeys.has(name), `Missing canonical export: ${name}`);
}
for (const name of MUST_NOT_EXIST) {
  assert.ok(!rootKeys.has(name), `Unexpected export found: ${name}`);
}

// ─── Load package.json exports map ───────────────────────────────────────

const pkg = JSON.parse(fs.readFileSync(PKG_PATH, "utf-8")) as {
  exports: Record<
    string,
    { import?: string; types?: string; require?: string }
  >;
};

// ─── Verify each compat subpath ──────────────────────────────────────────

const errors: string[] = [];

for (const [subpathKey, spec] of Object.entries(pkg.exports)) {
  if (subpathKey === ".") continue;
  if (!spec.import) continue;

  // Strip "./" prefix from the dist-relative path
  const rel = spec.import.replace(/^\.\//, "");
  const absPath = path.join(DIST, "..", rel);

  if (!fs.existsSync(absPath)) {
    errors.push(`[${subpathKey}] built file not found: ${absPath}`);
    continue;
  }

  const mod = (await import(pathToFileURL(absPath).href)) as Record<
    string,
    unknown
  >;
  const modKeys = Object.keys(mod);

  for (const key of modKeys) {
    if (!rootKeys.has(key)) {
      errors.push(
        `[${subpathKey}] leaks non-root export "${key}" (not in dist/index.js)`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error("verify-root-contract FAILED:\n" + errors.join("\n"));
  process.exit(1);
}

// ─── Validate dist/index.d.ts ─────────────────────────────────────────────

const dtsPath = path.join(DIST, "index.d.ts");
assert.ok(fs.existsSync(dtsPath), "dist/index.d.ts not found");
const dtsContent = fs.readFileSync(dtsPath, "utf-8");
assert.ok(
  dtsContent.includes("StoredAgentDefinitionSchema"),
  "dist/index.d.ts does not mention StoredAgentDefinitionSchema",
);
assert.ok(
  dtsContent.length > 200,
  "dist/index.d.ts looks like a stub (too short)",
);

console.log(
  `verify-root-contract PASSED (${rootKeys.size} root exports, ${Object.keys(pkg.exports).length - 1} compat subpaths verified)`,
);
