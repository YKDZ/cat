import type {
  SourceFile,
  FunctionDeclaration,
  VariableDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  EnumDeclaration,
  JSDoc,
} from "ts-morph";

import { SyntaxKind, Node } from "ts-morph";

import type { SymbolIR, ModuleIR, ParameterIR, SourceLocation } from "../ir.js";

import { extractEnDescription, extractEnInline } from "./tsdoc-parser.js";

/**
 * Build a raw text string from a JSDoc node that includes both the
 * description (pre-tag text) AND any custom block tags like @zh/@en.
 * This is needed because ts-morph's getDescription() only returns text
 * before the first block tag, excluding bilingual @zh/@en convention tags.
 */
const getRawDocComment = (jsdoc: JSDoc | undefined): string | undefined => {
  if (!jsdoc) return undefined;
  const desc = jsdoc.getDescription()?.trim() ?? "";
  const tags = jsdoc
    .getTags()
    .map((t) => `@${t.getTagName()} ${t.getCommentText()?.toString() ?? ""}`)
    .join("\n");
  const full = [desc, tags].filter(Boolean).join("\n").trim();
  return full || undefined;
};

const getParamDescription = (
  jsdoc: JSDoc | undefined,
  paramName: string,
): string | undefined => {
  if (!jsdoc) return undefined;
  const tag = jsdoc
    .getTags()
    .find((t) => Node.isJSDocParameterTag(t) && t.getName() === paramName);
  return tag?.getCommentText()?.toString();
};

const getReturnDescription = (jsdoc: JSDoc | undefined): string | undefined => {
  if (!jsdoc) return undefined;
  const tag = jsdoc.getTags().find((t) => Node.isJSDocReturnTag(t));
  const comment = tag?.getCommentText()?.toString();
  if (!comment) return undefined;
  // Strip leading dash separator used to prevent TS JSDoc parser conflict
  return comment.replace(/^-\s*/, "").trim() || undefined;
};

const getSourceLocation = (
  node: {
    getSourceFile: () => SourceFile;
    getStartLineNumber: () => number;
    getEndLineNumber: () => number;
  },
  rootPath: string,
): SourceLocation => ({
  filePath: node
    .getSourceFile()
    .getFilePath()
    .replace(rootPath + "/", ""),
  line: node.getStartLineNumber(),
  endLine: node.getEndLineNumber(),
});

const makeSymbolId = (
  pkgName: string,
  modulePath: string,
  symbolName: string,
): string => {
  const modPart = modulePath.replace(/\.ts$/, "");
  return `${pkgName}:${modPart}:${symbolName}`;
};

const buildSignatureText = (
  name: string,
  isAsync: boolean,
  isExported: boolean,
  isArrow: boolean,
  parameters: ParameterIR[],
  returnType: string | undefined,
): string => {
  const parts: string[] = [];
  if (isExported) parts.push("export ");
  if (isArrow) {
    parts.push("const ", name, " = ");
    if (isAsync) parts.push("async ");
    parts.push("(");
  } else {
    if (isAsync) parts.push("async ");
    parts.push("function ", name, "(");
  }
  parts.push(
    parameters
      .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
      .join(", "),
  );
  parts.push(")");
  if (returnType && returnType !== "void") {
    parts.push(`: ${returnType}`);
  }
  return parts.join("");
};

/**
 * @zh 通过三级回退策略获取参数类型文本。
 * @en Get parameter type text via three-level fallback strategy.
 *
 * 1. 如果参数有显式类型注解，使用源码文本（保留别名名称如 CreateProjectCommand）
 * 2. 如果已解析类型有别名符号，使用别名名称（如 DbContext）
 * 3. 否则使用 ts-morph 解析的类型文本（剥离 import 路径前缀）
 */
const getParamTypeText = (
  param: import("ts-morph").ParameterDeclaration,
): string => {
  const typeNode = param.getTypeNode();
  if (typeNode) return typeNode.getText();
  const type = param.getType();
  const alias = type.getAliasSymbol();
  if (alias) return alias.getName();
  return type.getText(param).replace(/import\([^)]+\)\./g, "");
};

export const createSymbolExtractor = (
  pkgName: string,
  rootPath: string,
): {
  extractModuleInfo: (sourceFile: SourceFile) => ModuleIR;
  extractFunctionSignature: (
    func: FunctionDeclaration,
    relativePath: string,
  ) => SymbolIR | null;
  extractTypeDefinition: (
    node: InterfaceDeclaration | TypeAliasDeclaration,
    relativePath: string,
  ) => SymbolIR | null;
} => {
  const extractFunctionSignature = (
    func: FunctionDeclaration,
    relativePath: string,
  ): SymbolIR | null => {
    const name = func.getName();
    if (!name) return null;

    const docs = func.getJsDocs();
    const rawDescription = getRawDocComment(docs[0]);
    const description = extractEnDescription(rawDescription);

    const parameters: ParameterIR[] = func.getParameters().map((param) => {
      const rawParamDesc = getParamDescription(docs[0], param.getName());
      return {
        name: param.getName(),
        type: param.getType().getText(param),
        description: extractEnInline(rawParamDesc),
        optional:
          param.hasQuestionToken() || param.getInitializer() !== undefined,
      };
    });

    const rawReturnDesc = getReturnDescription(docs[0]);
    const returnType = func.getReturnType().getText(func);
    const isAsync = func.isAsync();
    const isExported = func.isExported();

    const signature = buildSignatureText(
      name,
      isAsync,
      isExported,
      false,
      parameters,
      returnType === "void" ? undefined : returnType,
    );

    return {
      id: makeSymbolId(pkgName, relativePath, name),
      name,
      kind: "function",
      description,
      signature,
      parameters,
      returnType: returnType === "void" ? undefined : returnType,
      returnDescription: extractEnInline(rawReturnDesc),
      isAsync,
      isExported,
      sourceLocation: getSourceLocation(func, rootPath),
    };
  };

  const extractArrowFunction = (
    decl: VariableDeclaration,
    relativePath: string,
  ): SymbolIR | null => {
    const name = decl.getName();
    const initializer = decl.getInitializer();

    if (!initializer || initializer.getKind() !== SyntaxKind.ArrowFunction)
      return null;

    const stmt = decl.getVariableStatement();
    if (!stmt?.isExported()) return null;

    const docs = stmt?.getJsDocs();
    const rawDescription = getRawDocComment(docs?.[0]);
    const description = extractEnDescription(rawDescription);

    const arrowFunc = initializer.asKind(SyntaxKind.ArrowFunction);
    if (!arrowFunc) return null;

    const typeNode = decl.getTypeNode();
    const hasTypeAnnotation = typeNode !== undefined;

    let rawDeclaration: string | undefined;
    if (hasTypeAnnotation) {
      const stmtText = stmt?.getText() ?? "";
      const eqIndex = stmtText.indexOf("=");
      if (eqIndex > 0) {
        rawDeclaration = stmtText.slice(0, eqIndex).trim();
      }
    }

    const parameters: ParameterIR[] = arrowFunc.getParameters().map((param) => {
      const rawParamDesc = getParamDescription(docs?.[0], param.getName());
      return {
        name: param.getName(),
        type: getParamTypeText(param),
        description: extractEnInline(rawParamDesc),
        optional: param.hasQuestionToken(),
      };
    });

    const rawReturnDesc = getReturnDescription(docs?.[0]);
    const returnType = arrowFunc.getReturnType().getText(arrowFunc);
    const isAsync = arrowFunc.isAsync();
    const isExported = true;

    let signature: string;
    if (rawDeclaration) {
      const paramList = parameters
        .map((p) => `${p.name}${p.optional ? "?" : ""}: ${p.type}`)
        .join(", ");
      signature = `${rawDeclaration} = ${isAsync ? "async " : ""}(${paramList}) => {...}`;
    } else {
      signature = buildSignatureText(
        name,
        isAsync,
        isExported,
        true,
        parameters,
        returnType === "void" ? undefined : returnType,
      );
    }

    return {
      id: makeSymbolId(pkgName, relativePath, name),
      name,
      kind: "function",
      description,
      signature,
      rawDeclaration,
      parameters,
      returnType: returnType === "void" ? undefined : returnType,
      returnDescription: extractEnInline(rawReturnDesc),
      isAsync,
      isExported,
      sourceLocation: getSourceLocation(decl, rootPath),
    };
  };

  const extractTypeDefinition = (
    node: InterfaceDeclaration | TypeAliasDeclaration,
    relativePath: string,
  ): SymbolIR | null => {
    const name = node.getName();

    const docs = node.getJsDocs();
    const rawDescription = getRawDocComment(docs[0]);
    const description = extractEnDescription(rawDescription);

    const isInterface = node.getKind() === SyntaxKind.InterfaceDeclaration;
    const kind: SymbolIR["kind"] = isInterface ? "interface" : "type";

    let properties = undefined;

    if (isInterface) {
      const iface = node.asKind(SyntaxKind.InterfaceDeclaration);
      if (iface) {
        properties = iface.getProperties().map((prop) => {
          const propDocs = prop.getJsDocs();
          const rawPropDesc = getRawDocComment(propDocs[0]);
          return {
            name: prop.getName(),
            type: prop.getType().getText(prop),
            description: extractEnDescription(rawPropDesc),
            optional: prop.hasQuestionToken(),
          };
        });
      }
    }

    return {
      id: makeSymbolId(pkgName, relativePath, name),
      name,
      kind,
      description,
      isAsync: false,
      isExported: node.isExported(),
      sourceLocation: getSourceLocation(node, rootPath),
      properties,
    };
  };

  const extractEnumDefinition = (
    node: EnumDeclaration,
    relativePath: string,
  ): SymbolIR | null => {
    const name = node.getName();
    const docs = node.getJsDocs();
    const rawDescription = getRawDocComment(docs[0]);
    const description = extractEnDescription(rawDescription);

    return {
      id: makeSymbolId(pkgName, relativePath, name),
      name,
      kind: "enum",
      description,
      isAsync: false,
      isExported: node.isExported(),
      sourceLocation: getSourceLocation(node, rootPath),
    };
  };

  const extractModuleInfo = (sourceFile: SourceFile): ModuleIR => {
    const filePath = sourceFile.getFilePath();
    const relativePath = filePath.replace(
      rootPath.replace(/\/$/, "") + "/",
      "",
    );
    const symbols: SymbolIR[] = [];

    // Extract function declarations
    for (const func of sourceFile.getFunctions()) {
      const sym = extractFunctionSignature(func, relativePath);
      if (sym?.isExported) symbols.push(sym);
    }

    // Extract arrow function variables (project convention prefers arrow functions)
    for (const decl of sourceFile.getVariableDeclarations()) {
      const sym = extractArrowFunction(decl, relativePath);
      if (sym) symbols.push(sym);
    }

    // Extract interfaces
    for (const iface of sourceFile.getInterfaces()) {
      const sym = extractTypeDefinition(iface, relativePath);
      if (sym?.isExported) symbols.push(sym);
    }

    // Extract type aliases
    for (const alias of sourceFile.getTypeAliases()) {
      const sym = extractTypeDefinition(alias, relativePath);
      if (sym?.isExported) symbols.push(sym);
    }

    // Extract enums
    for (const enumDecl of sourceFile.getEnums()) {
      const sym = extractEnumDefinition(enumDecl, relativePath);
      if (sym?.isExported) symbols.push(sym);
    }

    return {
      relativePath,
      symbols,
    };
  };

  return { extractModuleInfo, extractFunctionSignature, extractTypeDefinition };
};
