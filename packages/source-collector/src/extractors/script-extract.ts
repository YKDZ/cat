import type { StructuredTranslatableElementInput } from "@cat/shared";

import { Node, Project } from "ts-morph";

import { buildStableSourceRef, buildTextFingerprint } from "./stable-ref.ts";

/** Reusable ts-morph Project instance. */
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
 * Regex for i18n context comments: matches `// @i18n-context: <text>` or block comment equivalent.
 */
const I18N_CONTEXT_RE = /@i18n-context:\s*(.+)/;

type ScriptExtractionOptions = {
  sourceLanguageId?: string;
};

const getNodeName = (node: Node): string | undefined => {
  if (Node.isIdentifier(node)) {
    return node.getText();
  }
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
    return node.getLiteralText();
  }
  if (Node.isComputedPropertyName(node)) {
    return node.getExpression().getText();
  }
  return undefined;
};

const getStableTsAnchorSegment = (node: Node): string | undefined => {
  if (Node.isClassDeclaration(node) && node.getName()) {
    return `class:${node.getName()}`;
  }
  if (Node.isFunctionDeclaration(node) && node.getName()) {
    return `function:${node.getName()}`;
  }
  if (Node.isMethodDeclaration(node)) {
    const name = getNodeName(node.getNameNode());
    return name ? `method:${name}` : undefined;
  }
  if (Node.isPropertyDeclaration(node)) {
    const name = getNodeName(node.getNameNode());
    return name ? `property:${name}` : undefined;
  }
  if (Node.isPropertyAssignment(node)) {
    const name = getNodeName(node.getNameNode());
    return name ? `property:${name}` : undefined;
  }
  if (Node.isVariableDeclaration(node)) {
    return `variable:${node.getName()}`;
  }
  return undefined;
};

const findStableTsAnchor = (
  node: Node,
  section: "script" | "scriptSetup" | "file",
): string => {
  const segments: string[] = [];
  let current = node.getParent();

  while (current) {
    const segment = getStableTsAnchorSegment(current);
    if (segment) {
      segments.push(segment);
    }
    current = current.getParent();
  }

  return segments.reverse().join("/") || section;
};

/**
 * Extract i18n calls from TypeScript/JavaScript source code.
 *
 * @param content - Script content
 * @param filePath - Relative file path
 * @param section - Script section identifier
 * @param lineOffset - Starting line offset inside the SFC block (0-based)
 * @param options - Extraction options
 * @returns - Extracted translatable elements
 */
export function extractFromScript(
  content: string,
  filePath: string,
  section: "script" | "scriptSetup" | "file",
  lineOffset: number,
  options: ScriptExtractionOptions = {},
): StructuredTranslatableElementInput[] {
  if (!content.includes("t(")) return [];

  const project = getProject();
  const tempName = `__extract_${Date.now()}_${Math.random().toString(36).slice(2)}.ts`;
  const sf = project.createSourceFile(tempName, content, { overwrite: true });

  const elements: StructuredTranslatableElementInput[] = [];
  const lines = content.split("\n");
  const sourceLanguageId = options.sourceLanguageId ?? "en";
  const occurrenceByAnchor = new Map<string, number>();

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

      const anchorPath = findStableTsAnchor(node, section) ?? section;
      const occurrenceKey = `${section}\u0000${anchorPath}`;
      const ordinal = occurrenceByAnchor.get(occurrenceKey) ?? 0;
      occurrenceByAnchor.set(occurrenceKey, ordinal + 1);
      const stableSourceRef = buildStableSourceRef({
        extractorId: "vue-i18n",
        filePath,
        section,
        anchorPath,
        callKind: funcName ?? "t",
        ordinal,
      });

      elements.push({
        ref: `vue-i18n:${filePath}:${section}:L${callLine}`,
        stableSourceRef,
        sourceNodeRef: `source-file:${filePath}`,
        localOrder: elements.length,
        text,
        languageId: sourceLanguageId,
        meta: {
          framework: "vue-i18n",
          file: filePath,
          section,
          callSite: `${section}:L${callLine}`,
          stableRefVersion: 1,
          stableRefAnchor: anchorPath,
          stableRefOrdinal: ordinal,
          textFingerprint: buildTextFingerprint(text),
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
