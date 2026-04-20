import type { CollectionElement } from "@cat/shared/schema/collection";

import { Node, Project } from "ts-morph";

/** @zh 复用的 ts-morph Project 实例。 @en Reusable ts-morph Project instance. */
let sharedProject: Project | undefined;

function getProject(): Project {
  if (!sharedProject) {
    sharedProject = new Project({
      useInMemoryFileSystem: true,
      compilerOptions: {
        allowJs: true,
        jsx: 4 /* JsxEmit.ReactJSX — numeric to avoid import */,
      },
    });
  }
  return sharedProject;
}

/**
 * @zh i18n 上下文注释的正则：匹配 `// @i18n-context: <text>` 或 `/* @i18n-context: <text> * /`。
 * @en Regex for i18n context comments: matches `// @i18n-context: <text>` or block comment equivalent.
 */
const I18N_CONTEXT_RE = /@i18n-context:\s*(.+)/;

/**
 * @zh 从 TypeScript/JavaScript 源码中提取 i18n 调用。
 * @en Extract i18n calls from TypeScript/JavaScript source code.
 *
 * @param content 脚本内容字符串
 * @param filePath 相对文件路径
 * @param section 脚本段标识（"script" | "scriptSetup" | "file"）
 * @param lineOffset 脚本块在 SFC 中的起始行偏移（0-based）。
 *                   对于独立 TS 文件传 0。
 */
export function extractFromScript(
  content: string,
  filePath: string,
  section: "script" | "scriptSetup" | "file",
  lineOffset: number,
): CollectionElement[] {
  if (!content.includes("t(")) return [];

  const project = getProject();
  const tempName = `__extract_${Date.now()}_${Math.random().toString(36).slice(2)}.ts`;
  const sf = project.createSourceFile(tempName, content, { overwrite: true });

  const elements: CollectionElement[] = [];
  const lines = content.split("\n");

  try {
    sf.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) return;

      const expr = node.getExpression();

      let funcName: string | undefined;
      if (Node.isIdentifier(expr)) {
        const name = expr.getText();
        if (name === "t" || name === "$t") funcName = name;
      }
      if (
        !funcName &&
        Node.isPropertyAccessExpression(expr) &&
        expr.getName() === "$t"
      ) {
        funcName = "$t";
      }

      if (!funcName) return;

      const args = node.getArguments();
      if (args.length === 0) return;

      const firstArg = args[0];
      if (!Node.isStringLiteral(firstArg)) return;

      const text = firstArg.getLiteralValue();
      if (!text || text.trim() === "") return;

      const callLine = node.getStartLineNumber() + lineOffset;

      const localLine = node.getStartLineNumber();
      let i18nContext: string | undefined;
      for (let i = localLine - 2; i >= Math.max(0, localLine - 3); i -= 1) {
        const lineText = lines[i];
        if (!lineText) break;
        const match = I18N_CONTEXT_RE.exec(lineText);
        if (match) {
          i18nContext = match[1].trim();
          break;
        }
        if (
          !lineText.trim().startsWith("//") &&
          !lineText.trim().startsWith("*")
        )
          break;
      }

      elements.push({
        ref: `vue-i18n:${filePath}:${section}:L${callLine}`,
        text,
        meta: {
          framework: "vue-i18n",
          file: filePath,
          callSite: `${section}:L${callLine}`,
        },
        location: {
          startLine: callLine,
          endLine: callLine,
          ...(i18nContext ? { custom: { i18nContext } } : {}),
        },
      });
    });
  } finally {
    project.removeSourceFile(sf);
  }

  return elements;
}
