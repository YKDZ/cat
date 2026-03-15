import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");

const protectedRoots = [
  "apps/app/src",
  "apps/app-api/src",
  "apps/app-agent/src",
  "packages/@cat-plugin",
].map((path) => resolve(repoRoot, path));

const allowlistedDbImportFiles = new Set([
  "apps/app/src/app/pages/+onCreateGlobalContext.server.ts",
  "apps/app/src/server/domain.ts",
  "apps/app/src/server/index.ts",
  "apps/app-api/src/utils/context.ts",
  "apps/app-agent/src/db/domain.ts",
  "apps/app-agent/src/graph/checkpointer/postgres.ts",
]);

const safeDbImports = new Set([
  "getRedisDB",
  "sanitizeFileName",
  "verifyPassword",
]);

const isProtectedSourceFile = (relativePath) => {
  return /\.(ts|tsx|js|jsx|vue)$/.test(relativePath);
};

const isIgnoredFile = (relativePath) => {
  return (
    relativePath.includes("/dist/") ||
    relativePath.includes("/out-tsc/") ||
    relativePath.includes("/playwright-report/") ||
    relativePath.includes("/test-results/") ||
    relativePath.includes("/coverage/") ||
    relativePath.endsWith(".d.ts") ||
    relativePath.includes("/__tests__/") ||
    /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(relativePath)
  );
};

const listFiles = (directory) => {
  const entries = readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
};

const parseNamedImports = (importsClause) => {
  const start = importsClause.indexOf("{");
  const end = importsClause.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  return importsClause
    .slice(start + 1, end)
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [importedName] = part.split(/\s+as\s+/i);
      return importedName.replace(/^type\s+/, "").trim();
    })
    .filter(Boolean);
};

const dbImportPattern =
  /import\s+(type\s+)?([^;]+?)\s+from\s+["']@cat\/db["'];/g;
const drizzleImportPattern =
  /import\s+(?!type\b)([^;]+?)\s+from\s+["']drizzle-orm(?:\/[^"']+)?["'];/g;

const violations = [];

for (const root of protectedRoots) {
  if (!statSync(root, { throwIfNoEntry: false })) {
    continue;
  }

  for (const filePath of listFiles(root)) {
    const relativePath = relative(repoRoot, filePath).replaceAll("\\", "/");
    if (!isProtectedSourceFile(relativePath) || isIgnoredFile(relativePath)) {
      continue;
    }

    const content = readFileSync(filePath, "utf8");
    const isAllowlisted = allowlistedDbImportFiles.has(relativePath);

    if (drizzleImportPattern.test(content)) {
      violations.push(
        `${relativePath}: protected entry-layer code must not import from drizzle-orm directly`,
      );
    }

    for (const match of content.matchAll(dbImportPattern)) {
      const isTypeOnly = match[1] !== undefined;
      if (isTypeOnly) {
        continue;
      }

      const namedImports = parseNamedImports(match[2] ?? "");
      for (const importedName of namedImports) {
        if (isAllowlisted) {
          continue;
        }

        if (!safeDbImports.has(importedName)) {
          violations.push(
            `${relativePath}: protected entry-layer code must not import \`${importedName}\` from @cat/db`,
          );
        }
      }
    }

    if (!isAllowlisted && /\bgetDrizzleDB\s*\(/.test(content)) {
      violations.push(
        `${relativePath}: protected entry-layer code must not call getDrizzleDB() directly`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error("Database boundary check failed:\n");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log("Database boundary check passed.");
