import type { CollectionElement } from "@cat/shared";
import type {
  DirectiveNode,
  ElementNode,
  InterpolationNode,
  RootNode,
  SimpleExpressionNode,
  TemplateChildNode,
} from "@vue/compiler-dom";

import { NodeTypes } from "@vue/compiler-dom";

/**
 * @zh 从模板表达式字符串中匹配 $t() 或 t() 调用的正则表达式。
 * @en Regex to match $t() or t() calls in template expression strings.
 *
 * Captures:
 * - Group 1: single-quoted string content
 * - Group 2: double-quoted string content
 */
const I18N_CALL_RE =
  /(?<!\w)\$?t\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;

/**
 * @zh 从 Vue 模板 AST 中提取 i18n 调用。
 * @en Extract i18n calls from a Vue template AST.
 *
 * @param ast 模板 AST 根节点（来自 @vue/compiler-sfc parse() 的 descriptor.template.ast
 *            或 @vue/compiler-dom parse() 的返回值）
 * @param filePath 相对文件路径，用于 meta.file
 * @param templateStartLine 模板块在 SFC 中的起始行号（1-based）。
 *                          对于独立模板文件传 0。
 */
export function extractFromTemplate(
  ast: RootNode,
  filePath: string,
  templateStartLine: number,
): CollectionElement[] {
  const elements: CollectionElement[] = [];
  for (const child of ast.children) {
    walkNode(child, elements, filePath, templateStartLine);
  }
  return elements;
}

function walkNode(
  node: TemplateChildNode,
  elements: CollectionElement[],
  filePath: string,
  templateStartLine: number,
): void {
  switch (node.type) {
    case NodeTypes.ELEMENT:
      walkElement(node, elements, filePath, templateStartLine);
      break;
    case NodeTypes.INTERPOLATION:
      walkInterpolation(node, elements, filePath, templateStartLine);
      break;
    case NodeTypes.IF:
      for (const branch of node.branches) {
        for (const child of branch.children) {
          walkNode(child, elements, filePath, templateStartLine);
        }
      }
      break;
    case NodeTypes.FOR:
      for (const child of node.children) {
        walkNode(child, elements, filePath, templateStartLine);
      }
      break;
    case NodeTypes.TEXT:
    case NodeTypes.COMMENT:
    case NodeTypes.COMPOUND_EXPRESSION:
    case NodeTypes.IF_BRANCH:
    case NodeTypes.TEXT_CALL:
      break;
  }
}

function walkElement(
  node: ElementNode,
  elements: CollectionElement[],
  filePath: string,
  templateStartLine: number,
): void {
  for (const prop of node.props) {
    if (prop.type === NodeTypes.DIRECTIVE) {
      const dir = prop;

      if (dir.name === "t" && dir.exp) {
        extractVTDirective(dir, elements, filePath, templateStartLine);
        continue;
      }

      if (dir.exp && dir.exp.type === NodeTypes.SIMPLE_EXPRESSION) {
        extractFromExpressionString(
          dir.exp,
          elements,
          filePath,
          templateStartLine,
        );
      }
    }
  }

  for (const child of node.children) {
    walkNode(child, elements, filePath, templateStartLine);
  }
}

function walkInterpolation(
  node: InterpolationNode,
  elements: CollectionElement[],
  filePath: string,
  templateStartLine: number,
): void {
  if (node.content.type === NodeTypes.SIMPLE_EXPRESSION) {
    extractFromExpressionString(
      node.content,
      elements,
      filePath,
      templateStartLine,
    );
  }
}

function extractFromExpressionString(
  expr: SimpleExpressionNode,
  elements: CollectionElement[],
  filePath: string,
  templateStartLine: number,
): void {
  const content = expr.content;
  I18N_CALL_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = I18N_CALL_RE.exec(content)) !== null) {
    const text = match[1] ?? match[2];
    if (!text || text.trim() === "") continue;

    const unescaped = text.replace(/\\(.)/g, "$1");

    const line = expr.loc.start.line + templateStartLine;
    const column = expr.loc.start.column + match.index;

    elements.push({
      ref: `vue-i18n:${filePath}:template:L${line}:C${column}`,
      text: unescaped,
      meta: {
        framework: "vue-i18n",
        file: filePath,
        callSite: `template:L${line}:C${column}`,
      },
      location: {
        startLine: line,
        endLine: line,
      },
    });
  }
}

function extractVTDirective(
  dir: DirectiveNode,
  elements: CollectionElement[],
  filePath: string,
  templateStartLine: number,
): void {
  if (!dir.exp || dir.exp.type !== NodeTypes.SIMPLE_EXPRESSION) return;

  const content = dir.exp.content.trim();

  let text: string | null = null;
  if (
    (content.startsWith("'") && content.endsWith("'")) ||
    (content.startsWith('"') && content.endsWith('"'))
  ) {
    text = content.slice(1, -1).replace(/\\(.)/g, "$1");
  }

  if (!text || text.trim() === "") return;

  const line = dir.exp.loc.start.line + templateStartLine;
  const column = dir.exp.loc.start.column;

  elements.push({
    ref: `vue-i18n:${filePath}:template:L${line}:C${column}`,
    text,
    meta: {
      framework: "vue-i18n",
      file: filePath,
      callSite: `template:L${line}:C${column}`,
    },
    location: {
      startLine: line,
      endLine: line,
    },
  });
}
