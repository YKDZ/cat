import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = resolve(import.meta.dirname, "..");

const activeExtensions = new Set([
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

const codeCommentExtensions = new Set([
  ".cjs",
  ".js",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
]);

const markdownCommentExtensions = new Set([".md", ".mdx", ".vue"]);
const yamlCommentExtensions = new Set([".yaml", ".yml"]);

const excludedPathPrefixes = [
  "node_modules/",
  "vendor/",
  "vendors/",
  "third_party/",
  "third-party/",
  "archive/",
  "archives/",
  "docs/archive/",
  "docs/archives/",
  "docs/adr/archive/",
  "docs/adr/archives/",
  "apps/docs/src/autodoc/",
  "tools/autodoc/",
] as const;

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

type CommentMatch = {
  line: number;
  snippet: string;
};

const hasHanText = (value: string) => /\p{Script=Han}/u.test(value);

const lineForOffset = (content: string, offset: number) =>
  content.slice(0, offset).split("\n").length;

const pushHanCommentMatch = (
  matches: CommentMatch[],
  content: string,
  start: number,
  comment: string,
) => {
  if (!hasHanText(comment)) return;

  const hanOffset = comment.search(/\p{Script=Han}/u);
  const line = lineForOffset(content, start + Math.max(hanOffset, 0));
  const snippet = comment
    .split("\n")
    .map((lineText) => lineText.trim())
    .find(hasHanText);

  matches.push({
    line,
    snippet: snippet ?? comment.trim().slice(0, 80),
  });
};

const collectCodeCommentMatches = (content: string): CommentMatch[] => {
  const matches: CommentMatch[] = [];
  let index = 0;
  let state:
    | "code"
    | "line-comment"
    | "block-comment"
    | "single-quote"
    | "double-quote"
    | "template" = "code";
  let commentStart = 0;

  while (index < content.length) {
    const char = content[index];
    const next = content[index + 1];

    if (state === "line-comment") {
      if (char === "\n") state = "code";
      index += 1;
      continue;
    }

    if (state === "block-comment") {
      if (char === "*" && next === "/") {
        const comment = content.slice(commentStart, index + 2);
        if (comment.startsWith("/**")) {
          pushHanCommentMatch(matches, content, commentStart, comment);
        }
        state = "code";
        index += 2;
        continue;
      }
      index += 1;
      continue;
    }

    if (
      state === "single-quote" ||
      state === "double-quote" ||
      state === "template"
    ) {
      const terminator =
        state === "single-quote" ? "'" : state === "double-quote" ? `"` : "`";
      if (char === "\\") {
        index += 2;
        continue;
      }
      if (char === terminator) state = "code";
      index += 1;
      continue;
    }

    if (char === "/" && next === "/") {
      commentStart = index;
      state = "line-comment";
      index += 2;
      continue;
    }

    if (char === "/" && next === "*") {
      commentStart = index;
      state = "block-comment";
      index += 2;
      continue;
    }

    if (char === "'") state = "single-quote";
    if (char === `"`) state = "double-quote";
    if (char === "`") state = "template";
    index += 1;
  }

  return matches;
};

const collectMarkdownCommentMatches = (content: string): CommentMatch[] => {
  const matches: CommentMatch[] = [];
  for (const match of content.matchAll(/<!--[\s\S]*?-->/gu)) {
    pushHanCommentMatch(matches, content, match.index, match[0]);
  }
  return matches;
};

const collectYamlCommentMatches = (content: string): CommentMatch[] => {
  const matches: CommentMatch[] = [];
  const commentPattern = /^[ \t]*#.*$/gmu;
  for (const match of content.matchAll(commentPattern)) {
    pushHanCommentMatch(matches, content, match.index, match[0]);
  }
  return matches;
};

const collectCommentMatches = (
  content: string,
  extension: string,
): CommentMatch[] => [
  ...(codeCommentExtensions.has(extension)
    ? collectCodeCommentMatches(content)
    : []),
  ...(markdownCommentExtensions.has(extension)
    ? collectMarkdownCommentMatches(content)
    : []),
  ...(yamlCommentExtensions.has(extension)
    ? collectYamlCommentMatches(content)
    : []),
];

const listRepositoryFiles = async () => {
  const { stdout } = await execFileAsync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );

  const candidateFiles = stdout
    .split("\0")
    .filter(Boolean)
    .filter((file) => activeExtensions.has(extname(file)))
    .filter(
      (file) => !excludedPathPrefixes.some((prefix) => file.startsWith(prefix)),
    );

  const existingFiles = await Promise.all(
    candidateFiles.map(async (file) => ({
      file,
      exists: await pathExists(resolve(repoRoot, file)),
    })),
  );

  return existingFiles.filter(({ exists }) => exists).map(({ file }) => file);
};

describe("bilingual comment cleanup", () => {
  it("keeps active repository assets free of retired bilingual TSDoc tags", async () => {
    const files = await listRepositoryFiles();
    const matches: string[] = [];

    await Promise.all(
      files.map(async (file) => {
        const content = await readFile(resolve(repoRoot, file), "utf8");
        const lineMatches = [...content.matchAll(/@(?:zh|en)\b/gu)];

        for (const match of lineMatches) {
          const line = content.slice(0, match.index).split("\n").length;
          matches.push(`${file}:${line}`);
        }
      }),
    );

    expect(matches.sort()).toEqual([]);
  });

  it("keeps retained cleanup comments free of Chinese bilingual text", async () => {
    const retainedCommentCleanupFiles = [
      "apps/app-api/src/orpc/middleware/with-branch-context.ts",
      "apps/app-api/src/orpc/routers/qa-review.ts",
      "apps/app-api/src/orpc/routers/translation.schemas.ts",
      "packages/vcs/src/strategies/term.diff.ts",
      "packages/vcs/src/vcs-middleware.ts",
      "packages/workflow/src/graph/vcs-write-helper.ts",
    ] as const;
    const matches: string[] = [];

    await Promise.all(
      retainedCommentCleanupFiles.map(async (file) => {
        const content = await readFile(resolve(repoRoot, file), "utf8");
        const extension = extname(file);

        for (const match of collectCommentMatches(content, extension)) {
          matches.push(`${file}:${match.line}: ${match.snippet}`);
        }
      }),
    );

    expect(matches.sort()).toEqual([]);
  });
});
