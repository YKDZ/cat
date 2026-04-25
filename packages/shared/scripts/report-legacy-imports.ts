/**
 * report-legacy-imports.ts
 *
 * Scans the entire workspace for remaining `@cat/shared/` subpath imports
 * and emits a JSON report. Excludes generated compat wrappers and dist dirs.
 *
 * Usage:
 *   pnpm tsx packages/shared/scripts/report-legacy-imports.ts          # stdout only
 *   pnpm tsx packages/shared/scripts/report-legacy-imports.ts --write  # also writes dist/legacy-import-report.json
 */
import * as fs from "node:fs";
import * as path from "node:path";

// ─── Configuration ────────────────────────────────────────────────────────────

const WORKSPACE_ROOT = path.resolve(import.meta.dirname, "../../../");
const REPORT_OUTPUT = path.resolve(
  import.meta.dirname,
  "../dist/legacy-import-report.json",
);

/** Top-level workspace directories to scan */
const SCAN_ROOTS = ["apps", "packages", "@cat-plugin", "tools"];

/** Path segments that indicate a file should be excluded from analysis */
const EXCLUDED_PATH_SEGMENTS = [
  "/dist/",
  "/node_modules/",
  "/out-tsc/",
  "/src/compat/",
];

/** File extensions to inspect */
const EXTENSIONS = new Set([".ts", ".tsx", ".vue", ".js"]);

/** Pattern that identifies a legacy @cat/shared subpath import/export */
const SUBPATH_PATTERN = /['"]@cat\/shared\//;

// ─── Scanning ─────────────────────────────────────────────────────────────────

interface FileMatch {
  file: string;
  count: number;
}

interface ProjectResult {
  matches: number;
  files: string[];
}

interface Report {
  totalMatches: number;
  projects: Record<string, ProjectResult>;
}

function isExcluded(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  return EXCLUDED_PATH_SEGMENTS.some((seg) => normalized.includes(seg));
}

function scanFile(filePath: string): number {
  const content = fs.readFileSync(filePath, "utf-8");
  let count = 0;
  for (const line of content.split("\n")) {
    if (SUBPATH_PATTERN.test(line)) count++;
  }
  return count;
}

function walkDir(dir: string, results: FileMatch[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (isExcluded(full)) continue;
    if (entry.isDirectory()) {
      walkDir(full, results);
    } else if (entry.isFile() && EXTENSIONS.has(path.extname(entry.name))) {
      const count = scanFile(full);
      if (count > 0) {
        results.push({ file: full, count });
      }
    }
  }
}

function deriveProjectKey(filePath: string, wsRoot: string): string {
  const rel = path.relative(wsRoot, filePath);
  const parts = rel.split(path.sep);
  // For @cat-plugin packages, use the first two parts
  if (parts[0] === "@cat-plugin") return parts.slice(0, 2).join("/");
  // Otherwise use the first two parts (e.g. "apps/app" or "packages/agent")
  return parts.slice(0, 2).join("/");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

const allMatches: FileMatch[] = [];

for (const scanRoot of SCAN_ROOTS) {
  walkDir(path.join(WORKSPACE_ROOT, scanRoot), allMatches);
}

// Build report
const report: Report = {
  totalMatches: 0,
  projects: {},
};

for (const { file, count } of allMatches.sort((a, b) =>
  a.file.localeCompare(b.file),
)) {
  report.totalMatches += count;
  const projectKey = deriveProjectKey(file, WORKSPACE_ROOT);
  const relFile = path.relative(WORKSPACE_ROOT, file).replace(/\\/g, "/");

  if (!report.projects[projectKey]) {
    report.projects[projectKey] = { matches: 0, files: [] };
  }
  report.projects[projectKey].matches += count;
  report.projects[projectKey].files.push(relFile);
}

const output = JSON.stringify(report, null, 2);
console.log(output);

if (process.argv.includes("--write")) {
  fs.mkdirSync(path.dirname(REPORT_OUTPUT), { recursive: true });
  fs.writeFileSync(REPORT_OUTPUT, output + "\n", "utf-8");
  console.error(`[report-legacy-imports] Wrote ${REPORT_OUTPUT}`);
}
