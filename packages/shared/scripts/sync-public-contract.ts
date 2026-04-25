/**
 * sync-public-contract.ts
 *
 * Parses src/index.ts (the canonical root export manifest), then:
 *   1. Generates src/compat/<subpath>.ts wrapper files that re-export
 *      from the root index (never from the original source modules).
 *   2. Rewrites package.json "exports" to point to dist/compat/*.
 *
 * Run: pnpm tsx packages/shared/scripts/sync-public-contract.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as ts from "typescript";

// ─── Paths ──────────────────────────────────────────────────────────────────

const SHARED_ROOT = path.resolve(import.meta.dirname, "..");
const INDEX_PATH = path.join(SHARED_ROOT, "src", "index.ts");
const COMPAT_DIR = path.join(SHARED_ROOT, "src", "compat");
const PKG_PATH = path.join(SHARED_ROOT, "package.json");

// ─── Alias projections (special groupings for legacy compat subpaths) ───────

/**
 * Explicit name lists for legacy subpaths that need to "regroup" canonical
 * root exports coming from different source modules.  Names not listed here
 * are derived automatically from the source module recorded in index.ts.
 *
 * Derived names are still verified against the root export map at runtime, so
 * a stale projection will produce a visible warning rather than a silent gap.
 */
const ALIAS_PROJECTIONS: Record<string, readonly string[]> = {
  utils: [
    "chunk",
    "chunkDual",
    "getIndex",
    "zip",
    "AssertError",
    "assertFirstNonNullish",
    "assertFirstOrNull",
    "assertKeysNonNullish",
    "assertPromise",
    "assertSingleNonNullish",
    "assertSingleOrNull",
    "summarizeError",
    "sanitizeFileName",
    "HTTPHelpers",
    "createHTTPHelpers",
    "delCookie",
    "getCookie",
    "getCookieFunc",
    "getQueryParam",
    "getQueryParamFunc",
    "getReqHeader",
    "setCookie",
    "setResHeader",
    "getDefaultFromSchema",
    "Logger",
    "TypedLogger",
    "logger",
    "LogEntry",
    "LogLevel",
    "LoggerTransport",
    "OutputSituation",
    "summarize",
    "resolveRouteTemplate",
    "useStringTemplate",
    "parsePreferredLanguage",
    "toShortFixed",
    "safeJoinURL",
  ],
  "schema/permission": [
    "PermissionCheckSchema",
    "PermissionCheck",
    "GrantPermissionSchema",
    "GrantPermission",
    "ObjectTypeSchema",
    "ObjectType",
    "SubjectTypeSchema",
    "SubjectType",
    "RelationSchema",
    "Relation",
    "PermissionActionSchema",
    "PermissionAction",
  ],
  "schema/collection": [
    "CollectionContext",
    "CollectionContextData",
    "CollectionContextDataFileSchema",
    "CollectionContextDataImageSchema",
    "CollectionContextDataJsonSchema",
    "CollectionContextDataMarkdownSchema",
    "CollectionContextDataSchema",
    "CollectionContextDataTextSchema",
    "CollectionContextDataUrlSchema",
    "CollectionContextSchema",
    "CollectionElement",
    "CollectionElementLocation",
    "CollectionElementLocationSchema",
    "CollectionElementSchema",
    "CollectionPayload",
    "CollectionPayloadSchema",
    "TranslatableElementContextTypeSchema",
  ],
  "schema/agent": [
    "AgentConstraints",
    "AgentConstraintsSchema",
    "AgentDefinitionMetadata",
    "AgentDefinitionMetadataSchema",
    "AgentLLMConfig",
    "AgentLLMConfigSchema",
    "AgentPromptConfig",
    "AgentPromptConfigSchema",
    "AgentScope",
    "AgentScopeSchema",
    "AgentSecurityPolicy",
    "AgentSecurityPolicySchema",
    "AgentSessionMetadata",
    "AgentSessionMetadataSchema",
    "ConfirmationPolicy",
    "ConfirmationPolicySchema",
    "ConfirmationPolicyValues",
    "Orchestration",
    "OrchestrationSchema",
    "ParsedAgentDefinition",
    "PipelineStage",
    "PipelineStageSchema",
    "ToolConfirmRequest",
    "ToolConfirmRequestSchema",
    "ToolConfirmResponse",
    "ToolConfirmResponseSchema",
    "ToolExecuteRequest",
    "ToolExecuteRequestSchema",
    "ToolExecuteResponse",
    "ToolExecuteResponseSchema",
    "serializeAgentDefinition",
  ],
  "schema/drizzle/file": ["FileSchema", "File"],
};

// ─── Ordered list of legacy subpaths to generate ───────────────────────────

const LEGACY_SUBPATHS = [
  "utils",
  "schema/json",
  "schema/misc",
  "schema/ce",
  "schema/plugin",
  "schema/enum",
  "schema/drizzle/document",
  "schema/drizzle/file",
  "schema/drizzle/qa",
  "schema/drizzle/glossary",
  "schema/drizzle/agent",
  "schema/drizzle/changeset",
  "schema/drizzle/memory",
  "schema/drizzle/misc",
  "schema/drizzle/plugin",
  "schema/drizzle/project",
  "schema/drizzle/translation",
  "schema/drizzle/user",
  "schema/drizzle/vector",
  "schema/drizzle/comment",
  "schema/drizzle/issue",
  "schema/drizzle/pull-request",
  "schema/drizzle/entity-branch",
  "schema/drizzle/issue-comment",
  "schema/agent",
  "schema/nlp",
  "schema/permission",
  "schema/term-recall",
  "schema/recall",
  "schema/precision-recall",
  "schema/memory-recall",
  "schema/rerank",
  "schema/project-setting",
  "schema/collection",
  "schema/extraction",
] as const;

// ─── Parsing ─────────────────────────────────────────────────────────────────

interface ExportEntry {
  isType: boolean;
  /** Relative specifier as written in index.ts, e.g. "./schema/json.ts" */
  sourceModule: string;
}

function parseIndexExports(indexPath: string): Map<string, ExportEntry> {
  const content = fs.readFileSync(indexPath, "utf-8");
  const sf = ts.createSourceFile(
    "index.ts",
    content,
    ts.ScriptTarget.ESNext,
    /* setParentNodes */ true,
  );

  const map = new Map<string, ExportEntry>();

  for (const stmt of sf.statements) {
    if (!ts.isExportDeclaration(stmt)) continue;
    if (!stmt.moduleSpecifier || !ts.isStringLiteral(stmt.moduleSpecifier))
      continue;
    if (!stmt.exportClause || !ts.isNamedExports(stmt.exportClause)) continue;

    const sourceModule = stmt.moduleSpecifier.text;
    const declIsType = stmt.isTypeOnly;

    for (const specifier of stmt.exportClause.elements) {
      const name = specifier.name.text;
      const isType = declIsType || specifier.isTypeOnly;
      if (map.has(name)) {
        console.warn(`[sync-contract] Duplicate root export: ${name}`);
      }
      map.set(name, { isType, sourceModule });
    }
  }

  return map;
}

// ─── Source module → subpath derivation ─────────────────────────────────────

/**
 * Converts a source module specifier (as written in index.ts) to a legacy
 * subpath name, e.g. `"./schema/json.ts"` → `"schema/json"`.
 *
 * Only used for subpaths not present in ALIAS_PROJECTIONS.
 */
function sourceModuleToSubpath(sourceModule: string): string {
  return sourceModule.replace(/^\.\//, "").replace(/\.ts$/, "");
}

// ─── Building the compat export lists ────────────────────────────────────────

interface CompatEntry {
  name: string;
  isType: boolean;
}

function buildCompatEntries(
  subpath: string,
  exportMap: Map<string, ExportEntry>,
): CompatEntry[] {
  // Case 1: explicit alias projection
  if (subpath in ALIAS_PROJECTIONS) {
    const names = ALIAS_PROJECTIONS[subpath];
    const result: CompatEntry[] = [];
    for (const name of names) {
      const entry = exportMap.get(name);
      if (!entry) {
        console.warn(
          `[sync-contract] aliasProjections["${subpath}"] lists "${name}" but it is not in root exports — skipping`,
        );
        continue;
      }
      result.push({ name, isType: entry.isType });
    }
    return result;
  }

  // Case 2: derive by source module
  const expectedSourceModule = `./${subpath}.ts`;
  const result: CompatEntry[] = [];
  for (const [name, entry] of exportMap) {
    if (entry.sourceModule === expectedSourceModule) {
      result.push({ name, isType: entry.isType });
    }
  }
  if (result.length === 0) {
    console.warn(
      `[sync-contract] No root exports found for source module "${expectedSourceModule}" (subpath: ${subpath})`,
    );
  }
  return result;
}

// ─── File generation ─────────────────────────────────────────────────────────

/** Returns the relative import path from a compat file back to src/index.ts */
function indexRelPath(subpath: string): string {
  const depth = subpath.split("/").length;
  return "../".repeat(depth) + "index.ts";
}

function generateCompatFileContent(
  subpath: string,
  entries: CompatEntry[],
): string {
  if (entries.length === 0) return "";

  const indexRel = indexRelPath(subpath);
  const header = `// Generated by packages/shared/scripts/sync-public-contract.ts. Do not edit by hand.\n`;

  // Build single-line specifier string, e.g. "type Foo, Bar"
  const inlineSpecifiers = entries
    .map((e) => (e.isType ? `type ${e.name}` : e.name))
    .join(", ");
  const singleLine = `export { ${inlineSpecifiers} } from "${indexRel}";`;

  // Use single-line format when it fits within printWidth (80), otherwise
  // fall back to multi-line format with trailing commas.
  if (singleLine.length <= 80) {
    return header + singleLine + "\n";
  }

  const multiLineSpecifiers = entries
    .map((e) => (e.isType ? `  type ${e.name},` : `  ${e.name},`))
    .join("\n");

  return header + `export {\n${multiLineSpecifiers}\n} from "${indexRel}";\n`;
}

function writeCompatFiles(
  exportMap: Map<string, ExportEntry>,
  subpaths: readonly string[],
): void {
  // Remove stale compat directory first so deleted subpaths don't linger
  if (fs.existsSync(COMPAT_DIR)) {
    fs.rmSync(COMPAT_DIR, { recursive: true });
  }

  for (const subpath of subpaths) {
    const entries = buildCompatEntries(subpath, exportMap);
    if (entries.length === 0) continue;

    const content = generateCompatFileContent(subpath, entries);
    const filePath = path.join(COMPAT_DIR, `${subpath}.ts`);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf-8");
  }
}

// ─── package.json update ─────────────────────────────────────────────────────

function updatePackageJsonExports(
  pkgPath: string,
  subpaths: readonly string[],
): void {
  const raw = fs.readFileSync(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as {
    exports: Record<string, unknown>;
    [key: string]: unknown;
  };

  const exports: Record<string, unknown> = {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
  };

  for (const subpath of subpaths) {
    exports[`./${subpath}`] = {
      types: `./dist/compat/${subpath}.d.ts`,
      import: `./dist/compat/${subpath}.js`,
    };
  }

  pkg.exports = exports;

  // Preserve trailing newline
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf-8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const exportMap = parseIndexExports(INDEX_PATH);
console.log(`[sync-contract] Parsed ${exportMap.size} root exports`);

// Only generate wrappers for subpaths that would have at least one export
const activeSubpaths = LEGACY_SUBPATHS.filter((sp) => {
  const entries = buildCompatEntries(sp, exportMap);
  return entries.length > 0;
});

writeCompatFiles(exportMap, activeSubpaths);
console.log(`[sync-contract] Wrote ${activeSubpaths.length} compat wrappers`);

updatePackageJsonExports(PKG_PATH, activeSubpaths);
console.log("[sync-contract] Updated package.json exports");
