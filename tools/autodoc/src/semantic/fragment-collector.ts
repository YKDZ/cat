import { glob } from "glob";
import { readFile } from "node:fs/promises";
import { relative } from "node:path";

import type { SemanticFragment } from "./ir.js";

// ── stableKey reference extraction ────────────────────────────────────────────

/**
 * @zh 从片段正文中提取所有 `{@stableKey ...}` 或 `` `stableKey:...` `` 格式的稳定键引用。
 * @en Extract stableKey references from fragment body text.
 * Supports `{@stableKey pkg:mod:name}` and backtick `pkg:mod:name` reference patterns.
 */
const extractStableKeyRefs = (body: string): string[] => {
  const refs = new Set<string>();
  // {@stableKey @pkg/mod:path:name} or similar
  for (const m of body.matchAll(/\{@stableKey\s+([^}]+)\}/g)) {
    refs.add(m[1].trim());
  }
  // Backtick references: `@cat/pkg:src/file:symbolName`
  for (const m of body.matchAll(/`(@[^/`]+\/[^:`]+:[^:`]+:[^`]+)`/g)) {
    refs.add(m[1].trim());
  }
  return Array.from(refs);
};

// ── README anchor fragment collection ─────────────────────────────────────────

const README_ANCHOR_START_RE = /<!--\s*autodoc:subject=([^\s>]+)\s*-->/;
const README_ANCHOR_END = "<!-- autodoc:end -->";

/**
 * @zh 从单个 README 文件提取所有 autodoc 锚点片段。
 * @en Extract all autodoc anchor fragments from a single README file.
 */
const collectReadmeFragments = (
  content: string,
  filePath: string,
): SemanticFragment[] => {
  const fragments: SemanticFragment[] = [];
  const lines = content.split("\n");

  let i = 0;
  while (i < lines.length) {
    const startMatch = README_ANCHOR_START_RE.exec(lines[i]);
    if (!startMatch) {
      i += 1;
      continue;
    }

    const subjectId = startMatch[1];
    const startLine = i + 1; // 1-based
    const bodyLines: string[] = [];
    i += 1;

    while (i < lines.length) {
      if (lines[i].trim() === README_ANCHOR_END) {
        break;
      }
      bodyLines.push(lines[i]);
      i += 1;
    }

    const body = bodyLines.join("\n").trim();
    fragments.push({
      subjectId,
      body,
      sourcePath: filePath,
      startLine,
      sourceType: "readme-anchor",
      referencedStableKeys: extractStableKeyRefs(body),
    });
    i += 1; // skip the end marker
  }

  return fragments;
};

// ── *.semantic.md front-matter parsing ────────────────────────────────────────

/**
 * @zh 简单的 YAML front-matter 解析：只读取 subject、title 字段。
 * @en Minimal YAML front-matter parser: reads `subject:` and `title:` fields only.
 */
const parseSemanticMdFrontmatter = (
  content: string,
): {
  subject: string | null;
  title: string | undefined;
  body: string;
  fmLineCount: number;
} => {
  if (!content.startsWith("---")) {
    return { subject: null, title: undefined, body: content, fmLineCount: 0 };
  }

  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { subject: null, title: undefined, body: content, fmLineCount: 0 };
  }

  const fmText = content.slice(3, endIndex).trim();
  const body = content.slice(endIndex + 4).trim();
  const fmLineCount = content.slice(0, endIndex + 4).split("\n").length;

  let subject: string | null = null;
  let title: string | undefined;

  for (const line of fmText.split("\n")) {
    const subjectMatch = /^subject:\s*(.+)$/.exec(line.trim());
    if (subjectMatch) {
      subject = subjectMatch[1].replace(/['"]/g, "").trim();
      continue;
    }
    const titleMatch = /^title:\s*(.+)$/.exec(line.trim());
    if (titleMatch) {
      title = titleMatch[1].replace(/['"]/g, "").trim();
    }
  }

  return { subject, title, body, fmLineCount };
};

/**
 * @zh 从单个 *.semantic.md 文件读取语义片段。
 * @en Collect a semantic fragment from a single *.semantic.md file.
 */
const collectSemanticMdFragment = (
  content: string,
  filePath: string,
): SemanticFragment | null => {
  const { subject, title, body, fmLineCount } =
    parseSemanticMdFrontmatter(content);
  if (!subject) return null;

  return {
    subjectId: subject,
    body,
    sourcePath: filePath,
    startLine: fmLineCount + 1,
    sourceType: "semantic-md",
    referencedStableKeys: extractStableKeyRefs(body),
    title,
  };
};

// ── Public API ─────────────────────────────────────────────────────────────────

export interface FragmentCollectorOptions {
  /** @zh Workspace root 绝对路径 @en Absolute workspace root path */
  workspaceRoot: string;
  /**
   * @zh 用于 README 锚点扫描的文件 glob（相对于 workspaceRoot）。
   * @en Glob patterns for README files (relative to workspaceRoot) to scan for anchors.
   */
  readmeGlobs?: string[];
  /**
   * @zh 用于 `*.semantic.md` 扫描的 glob 列表（来自 config.fragments）。
   * @en Glob patterns for `*.semantic.md` files (from config.fragments).
   */
  semanticMdGlobs?: string[];
}

/**
 * @zh 收集所有语义片段（README 锚点 + *.semantic.md），返回扁平列表。
 * @en Collect all semantic fragments (README anchors + *.semantic.md), returning a flat list.
 */
export const collectFragments = async (
  options: FragmentCollectorOptions,
): Promise<SemanticFragment[]> => {
  const {
    workspaceRoot,
    readmeGlobs = ["**/README.md", "**/readme.md"],
    semanticMdGlobs = [],
  } = options;

  const fragments: SemanticFragment[] = [];

  // ── Collect README anchor fragments ─────────────────────────────────────────
  const readmeFiles = (
    await glob(readmeGlobs, {
      cwd: workspaceRoot,
      ignore: ["**/node_modules/**"],
      absolute: true,
    })
  ).sort();

  for (const absPath of readmeFiles) {
    try {
      // oxlint-disable-next-line no-await-in-loop
      const content = await readFile(absPath, "utf-8");
      const relPath = relative(workspaceRoot, absPath);
      const fileFragments = collectReadmeFragments(content, relPath);
      fragments.push(...fileFragments);
    } catch {
      // Skip unreadable files
    }
  }

  // ── Collect *.semantic.md fragments ─────────────────────────────────────────
  if (semanticMdGlobs.length > 0) {
    const semanticFiles = (
      await glob(semanticMdGlobs, {
        cwd: workspaceRoot,
        ignore: ["**/node_modules/**"],
        absolute: true,
      })
    ).sort();

    for (const absPath of semanticFiles) {
      try {
        // oxlint-disable-next-line no-await-in-loop
        const content = await readFile(absPath, "utf-8");
        const relPath = relative(workspaceRoot, absPath);
        const fragment = collectSemanticMdFragment(content, relPath);
        if (fragment) fragments.push(fragment);
      } catch {
        // Skip unreadable files
      }
    }
  }

  return fragments;
};

/**
 * @zh 从字符串内容收集语义片段（测试与 CLI 内联用途）。
 * @en Collect semantic fragments from string content (for testing or inline use).
 */
export const collectFragmentsFromString = (
  content: string,
  filePath: string,
  sourceType: "readme-anchor" | "semantic-md",
): SemanticFragment[] => {
  if (sourceType === "readme-anchor") {
    return collectReadmeFragments(content, filePath);
  }
  const fragment = collectSemanticMdFragment(content, filePath);
  return fragment ? [fragment] : [];
};

/** @zh 解析 *.semantic.md 文件中的 front-matter（测试用途）。 @en Parse front-matter from a *.semantic.md string (for testing). */
export const parseSemanticMdFrontmatterPublic = parseSemanticMdFrontmatter;
