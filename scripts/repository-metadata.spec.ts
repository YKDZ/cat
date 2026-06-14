import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

const activeMetadataFiles = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "moon.yml",
  "apps/docs/moon.yml",
  "vitest.config.ts",
  "tsconfig.node.json",
  "oxlint.config.ts",
  "oxfmt.config.ts",
] as const;

const activeTextExtensions = new Set([
  ".cjs",
  ".js",
  ".json",
  ".md",
  ".mdx",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml",
]);

const excludedResidualAutoDocPathPrefixes = [
  ".agents/",
  ".claude/",
  ".scratch/",
  "archive/",
  "archives/",
  "docs/archive/",
  "docs/archives/",
  "node_modules/",
  "vendor/",
  "vendors/",
  "third_party/",
  "third-party/",
] as const;

const excludedResidualAutoDocValidationFiles = new Set([
  "scripts/bilingual-comments.spec.ts",
  "scripts/developer-docs.spec.ts",
  "scripts/repository-metadata.spec.ts",
]);

const retiredAutoDocMarkers = [
  "AutoDoc",
  "autodoc",
  "@cat/autodoc",
  "tools/autodoc",
  "apps/docs/src/autodoc",
  ".symbol-index.json",
] as const;

const retiredAutoDocPathPatterns = [
  {
    label: "retired AutoDoc tool path",
    pattern: /(^|\/)tools\/autodoc(\/|$)/u,
  },
  {
    label: "generated AutoDoc docs route",
    pattern: /^apps\/docs\/src\/autodoc(\/|$)/u,
  },
  { label: "AutoDoc subject manifest", pattern: /\.subject\.ts$/u },
  { label: "AutoDoc semantic fragment", pattern: /\.semantic\.md$/u },
  {
    label: "old AutoDoc skill",
    pattern: /(^|\/)skills?\/[^/]*autodoc[^/]*(\/|$)/iu,
  },
] as const;

const retiredAutoDocContentPatterns = [
  { label: "AutoDoc reference", pattern: /autodoc/iu },
  { label: "AutoDoc package reference", pattern: /@cat\/autodoc/u },
  { label: "AutoDoc tool path", pattern: /tools\/autodoc/u },
  {
    label: "generated AutoDoc docs route",
    pattern: /(apps\/docs\/src\/autodoc|\/autodoc\/)/u,
  },
  { label: "AutoDoc subject manifest reference", pattern: /\.subject\.ts/u },
  { label: "AutoDoc semantic fragment reference", pattern: /\.semantic\.md/u },
  {
    label: "AutoDoc CLI/package/task reference",
    pattern:
      /(@cat\/autodoc|\bautodoc:|\b(?:build|check|generate)-autodoc\b|\bautodoc\s+(?:build|check|generate)\b)/iu,
  },
  {
    label: "old AutoDoc skill reference",
    pattern: /(skills?\/[^\n]*autodoc|skill:\s*[^\n]*autodoc)/iu,
  },
] as const;

const intentionalAutoDocTsconfigDeletions = [
  "tools/autodoc/tsconfig.json",
  "tools/autodoc/tsconfig.lib.json",
  "tools/autodoc/tsconfig.spec.json",
] as const;

const readRepoFile = (path: string) =>
  readFile(resolve(repoRoot, path), "utf8");

const stripIntentionalAutoDocTsconfigDeletionAllowance = (content: string) =>
  intentionalAutoDocTsconfigDeletions.reduce(
    (normalized, allowedPath) => normalized.replaceAll(allowedPath, ""),
    content,
  );

const pathExists = async (path: string) => {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
};

const listActiveRepositoryFiles = async () => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );

  const candidateFiles = stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) => !excludedResidualAutoDocValidationFiles.has(file))
    .filter(
      (file) =>
        !excludedResidualAutoDocPathPrefixes.some((prefix) =>
          file.startsWith(prefix),
        ),
    );

  const existingFiles = await Promise.all(
    candidateFiles.map(async (file) => ({
      file,
      exists: await pathExists(resolve(repoRoot, file)),
    })),
  );

  return existingFiles.filter(({ exists }) => exists).map(({ file }) => file);
};

const searchableAutoDocAuditContent = (file: string, content: string) =>
  file === "moon.yml"
    ? stripIntentionalAutoDocTsconfigDeletionAllowance(content)
    : content;

const lineForOffset = (content: string, offset: number) =>
  content.slice(0, offset).split("\n").length;

const globalPattern = (pattern: RegExp) =>
  pattern.flags.includes("g")
    ? pattern
    : new RegExp(pattern.source, `${pattern.flags}g`);

describe("repository metadata validation gates", () => {
  it("keeps active workspace metadata free of retired AutoDoc references", async () => {
    const matches: string[] = [];

    await Promise.all(
      activeMetadataFiles.map(async (file) => {
        const content = await readRepoFile(file);
        const searchableContent =
          file === "moon.yml"
            ? stripIntentionalAutoDocTsconfigDeletionAllowance(content)
            : content;
        for (const marker of retiredAutoDocMarkers) {
          if (searchableContent.includes(marker)) {
            matches.push(`${file}: ${marker}`);
          }
        }
      }),
    );

    expect(matches.sort()).toEqual([]);
  });

  it("keeps schema generation and moon project sync checks wired", async () => {
    const moonConfig = await readRepoFile("moon.yml");

    expect(moonConfig).toContain("db:codegen-schemas");
    expect(moonConfig).toContain("moon sync projects");
    expect(moonConfig).toContain(
      "git diff --exit-code -- packages/shared/src/schema/drizzle",
    );
    expect(moonConfig).toContain("allowed_tsconfig_diff");
    for (const allowedPath of intentionalAutoDocTsconfigDeletions) {
      expect(moonConfig).toContain(allowedPath);
    }
    expect(
      stripIntentionalAutoDocTsconfigDeletionAllowance(moonConfig),
    ).not.toMatch(/autodoc/iu);
    expect(moonConfig).not.toContain("schema_diff_before");
    expect(moonConfig).not.toContain("schema_diff_after");
    expect(moonConfig).not.toContain("tsconfig_diff_before");
    expect(moonConfig).not.toContain("tsconfig_diff_after");
  });

  it("keeps active Git deliverables free of residual AutoDoc assets and references", async () => {
    const files = await listActiveRepositoryFiles();
    const matches: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        for (const audit of retiredAutoDocPathPatterns) {
          if (audit.pattern.test(file)) {
            matches.push(`${file}: ${audit.label}`);
          }
        }

        if (!activeTextExtensions.has(extname(file))) return;

        const content = await readFile(resolve(repoRoot, file), "utf8");
        const searchableContent = searchableAutoDocAuditContent(file, content);

        for (const audit of retiredAutoDocContentPatterns) {
          for (const match of searchableContent.matchAll(
            globalPattern(audit.pattern),
          )) {
            matches.push(
              `${file}:${lineForOffset(searchableContent, match.index ?? 0)}: ${audit.label}`,
            );
          }
        }
      }),
    );

    expect(matches.sort()).toEqual([]);
  });

  it("keeps docs tasks validating hand-written docs without generated docs imports", async () => {
    const docsTasks = await readRepoFile("apps/docs/moon.yml");
    const docsConfig = await readRepoFile("apps/docs/src/.vitepress/config.ts");

    expect(docsTasks).toContain("vitepress build src");
    expect(docsTasks).toContain("vue-tsc --noEmit -p tsconfig.app.json");
    expect(docsTasks).not.toMatch(/autodoc/iu);
    expect(docsConfig).toContain("/developer/");
    expect(docsConfig).not.toMatch(/autodoc/iu);
  });

  it("keeps ignored local agent guidance out of active Git deliverables", async () => {
    const { stdout } = await execFileAsync(
      "git",
      [
        "check-ignore",
        "-v",
        "AGENTS.md",
        ".agents/rules/README.md",
        ".claude/rules/example.md",
        ".scratch/retire-autodoc-agent-rules/PRD.md",
      ],
      { cwd: repoRoot, encoding: "utf8" },
    );

    expect(stdout).toContain("AGENTS.md");
    expect(stdout).toContain(".agents/rules/README.md");
    expect(stdout).toContain(".claude/rules/example.md");
    expect(stdout).toContain(".scratch/retire-autodoc-agent-rules/PRD.md");
  });
});
