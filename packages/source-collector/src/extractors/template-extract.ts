import type { StructuredTranslatableElementInput } from "@cat/shared";
import type {
  DirectiveNode,
  ElementNode,
  InterpolationNode,
  RootNode,
  SimpleExpressionNode,
  TemplateChildNode,
} from "@vue/compiler-dom";

import { NodeTypes } from "@vue/compiler-dom";

import { buildStableSourceRef, buildTextFingerprint } from "./stable-ref.ts";

type TemplateExtractionOptions = {
  sourceLanguageId?: string;
};

type TemplateWalkContext = {
  elements: StructuredTranslatableElementInput[];
  filePath: string;
  templateStartLine: number;
  sourceLanguageId: string;
  occurrenceByAnchor: Map<string, number>;
};

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
 * @param ast - {@zh 模板 AST 根节点} {@en Template AST root node}
 * @param filePath - {@zh 相对文件路径，用于 meta.file} {@en Relative file path used in meta.file}
 * @param templateStartLine - {@zh 模板块在 SFC 中的起始行号偏移（1-based）} {@en Starting line offset of the template block inside the SFC (1-based)}
 * @param options - {@zh 提取选项} {@en Extraction options}
 * @returns - {@zh 提取出的可翻译元素} {@en Extracted translatable elements}
 */
export function extractFromTemplate(
  ast: RootNode,
  filePath: string,
  templateStartLine: number,
  options: TemplateExtractionOptions = {},
): StructuredTranslatableElementInput[] {
  const elements: StructuredTranslatableElementInput[] = [];
  const context: TemplateWalkContext = {
    elements,
    filePath,
    templateStartLine,
    sourceLanguageId: options.sourceLanguageId ?? "en",
    occurrenceByAnchor: new Map<string, number>(),
  };

  for (const [index, child] of ast.children.entries()) {
    walkNode(child, context, `root[${index}]`);
  }

  return elements;
}

const nextTemplateOrdinal = (
  occurrenceByAnchor: Map<string, number>,
  anchorPath: string,
): number => {
  const occurrenceKey = `template\u0000${anchorPath}`;
  const ordinal = occurrenceByAnchor.get(occurrenceKey) ?? 0;
  occurrenceByAnchor.set(occurrenceKey, ordinal + 1);
  return ordinal;
};

const pushTemplateElement = (input: {
  context: TemplateWalkContext;
  text: string;
  line: number;
  column: number;
  anchorPath: string;
  callKind: string;
}): void => {
  const anchorPath = input.anchorPath || "template-root";
  const ordinal = nextTemplateOrdinal(
    input.context.occurrenceByAnchor,
    anchorPath,
  );
  const stableSourceRef = buildStableSourceRef({
    extractorId: "vue-i18n",
    filePath: input.context.filePath,
    section: "template",
    anchorPath,
    callKind: input.callKind,
    ordinal,
  });

  input.context.elements.push({
    ref: `vue-i18n:${input.context.filePath}:template:L${input.line}:C${input.column}`,
    stableSourceRef,
    sourceNodeRef: `source-file:${input.context.filePath}`,
    localOrder: input.context.elements.length,
    text: input.text,
    languageId: input.context.sourceLanguageId,
    meta: {
      framework: "vue-i18n",
      file: input.context.filePath,
      section: "template",
      callSite: `template:L${input.line}:C${input.column}`,
      stableRefVersion: 1,
      stableRefAnchor: anchorPath,
      stableRefOrdinal: ordinal,
      textFingerprint: buildTextFingerprint(input.text),
    },
    location: {
      startLine: input.line,
      endLine: input.line,
    },
  });
};

function walkNode(
  node: TemplateChildNode,
  context: TemplateWalkContext,
  nodePath: string,
): void {
  switch (node.type) {
    case NodeTypes.ELEMENT:
      walkElement(node, context, `${nodePath}/element:${node.tag}`);
      break;
    case NodeTypes.INTERPOLATION:
      walkInterpolation(node, context, `${nodePath}/interpolation`);
      break;
    case NodeTypes.IF:
      for (const [branchIndex, branch] of node.branches.entries()) {
        for (const [childIndex, child] of branch.children.entries()) {
          walkNode(
            child,
            context,
            `${nodePath}/if-branch[${branchIndex}]/child[${childIndex}]`,
          );
        }
      }
      break;
    case NodeTypes.FOR:
      for (const [childIndex, child] of node.children.entries()) {
        walkNode(child, context, `${nodePath}/for-child[${childIndex}]`);
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
  context: TemplateWalkContext,
  nodePath: string,
): void {
  for (const prop of node.props) {
    if (prop.type === NodeTypes.DIRECTIVE) {
      const dir = prop;

      if (dir.name === "t" && dir.exp) {
        extractVTDirective(dir, context, `${nodePath}/directive:v-t`);
        continue;
      }

      if (dir.exp && dir.exp.type === NodeTypes.SIMPLE_EXPRESSION) {
        const argName =
          dir.arg?.type === NodeTypes.SIMPLE_EXPRESSION
            ? dir.arg.content
            : dir.name;
        extractFromExpressionString(
          dir.exp,
          context,
          `${nodePath}/directive:${dir.name}:${argName}`,
        );
      }
    }
  }

  for (const [childIndex, child] of node.children.entries()) {
    walkNode(child, context, `${nodePath}/child[${childIndex}]`);
  }
}

function walkInterpolation(
  node: InterpolationNode,
  context: TemplateWalkContext,
  nodePath: string,
): void {
  if (node.content.type === NodeTypes.SIMPLE_EXPRESSION) {
    extractFromExpressionString(node.content, context, `${nodePath}/expr`);
  }
}

function extractFromExpressionString(
  expr: SimpleExpressionNode,
  context: TemplateWalkContext,
  anchorPath: string,
): void {
  const content = expr.content;
  I18N_CALL_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = I18N_CALL_RE.exec(content)) !== null) {
    const text = match[1] ?? match[2];
    if (!text || text.trim() === "") continue;

    const unescaped = text.replace(/\\(.)/g, "$1");

    const line = expr.loc.start.line + context.templateStartLine;
    const column = expr.loc.start.column + match.index;

    pushTemplateElement({
      context,
      text: unescaped,
      line,
      column,
      anchorPath,
      callKind: match[0].startsWith("$t(") ? "$t" : "t",
    });
  }
}

function extractVTDirective(
  dir: DirectiveNode,
  context: TemplateWalkContext,
  anchorPath: string,
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

  const line = dir.exp.loc.start.line + context.templateStartLine;
  const column = dir.exp.loc.start.column;

  pushTemplateElement({
    context,
    text,
    line,
    column,
    anchorPath,
    callKind: "v-t",
  });
}
