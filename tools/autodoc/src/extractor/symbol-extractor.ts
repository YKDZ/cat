import type {
  Project,
  SourceFile,
  FunctionDeclaration,
  VariableDeclaration,
  InterfaceDeclaration,
  TypeAliasDeclaration,
  JSDoc,
} from "ts-morph";

import { SyntaxKind, Node } from "ts-morph";

import type {
  FunctionSignature,
  TypeDefinition,
  ModuleInfo,
} from "../types.js";

import { extractEnDescription, extractEnInline } from "./tsdoc-parser.js";

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
  return tag?.getCommentText()?.toString();
};

export const createSymbolExtractor = (
  _project: Project,
): {
  extractModuleInfo: (sourceFile: SourceFile) => ModuleInfo;
  extractFunctionSignature: (
    func: FunctionDeclaration,
  ) => FunctionSignature | null;
  extractTypeDefinition: (
    node: InterfaceDeclaration | TypeAliasDeclaration,
  ) => TypeDefinition | null;
} => {
  const extractFunctionSignature = (
    func: FunctionDeclaration,
  ): FunctionSignature | null => {
    const name = func.getName();
    if (!name) return null;

    const docs = func.getJsDocs();
    const rawDescription = docs[0]?.getDescription()?.trim();
    // Extract @en content; fall back to raw description for monolingual code
    const description = extractEnDescription(rawDescription);

    const parameters = func.getParameters().map((param) => {
      const rawParamDesc = getParamDescription(docs[0], param.getName());
      return {
        name: param.getName(),
        type: param.getType().getText(param),
        // Extract {@en ...} inline content from @param description
        description: extractEnInline(rawParamDesc),
        optional:
          param.hasQuestionToken() || param.getInitializer() !== undefined,
      };
    });

    const rawReturnDesc = getReturnDescription(docs[0]);
    const returnType = func.getReturnType().getText(func);

    return {
      name,
      description,
      parameters,
      returnType: returnType === "void" ? undefined : returnType,
      returnDescription: extractEnInline(rawReturnDesc),
      isExported: func.isExported(),
      isAsync: func.isAsync(),
    };
  };

  const extractArrowFunction = (
    decl: VariableDeclaration,
  ): FunctionSignature | null => {
    const name = decl.getName();
    const initializer = decl.getInitializer();

    if (!initializer || initializer.getKind() !== SyntaxKind.ArrowFunction)
      return null;

    const stmt = decl.getVariableStatement();
    const docs = stmt?.getJsDocs();
    const rawDescription = docs?.[0]?.getDescription()?.trim();
    const description = extractEnDescription(rawDescription);

    const arrowFunc = initializer.asKind(SyntaxKind.ArrowFunction);
    if (!arrowFunc) return null;

    const parameters = arrowFunc.getParameters().map((param) => {
      const rawParamDesc = getParamDescription(docs?.[0], param.getName());
      return {
        name: param.getName(),
        type: param.getType().getText(param),
        description: extractEnInline(rawParamDesc),
        optional: param.hasQuestionToken(),
      };
    });

    const rawReturnDesc = getReturnDescription(docs?.[0]);
    const returnType = arrowFunc.getReturnType().getText(arrowFunc);

    return {
      name,
      description,
      parameters,
      returnType: returnType === "void" ? undefined : returnType,
      returnDescription: extractEnInline(rawReturnDesc),
      isExported: stmt?.isExported() ?? false,
      isAsync: arrowFunc.isAsync(),
    };
  };

  const extractTypeDefinition = (
    node: InterfaceDeclaration | TypeAliasDeclaration,
  ): TypeDefinition | null => {
    const name = node.getName();
    const kind =
      node.getKind() === SyntaxKind.InterfaceDeclaration ? "interface" : "type";

    const docs = node.getJsDocs();
    const rawDescription = docs[0]?.getDescription()?.trim();
    const description = extractEnDescription(rawDescription);

    let properties: TypeDefinition["properties"] = [];

    if (node.getKind() === SyntaxKind.InterfaceDeclaration) {
      const iface = node.asKind(SyntaxKind.InterfaceDeclaration);
      if (iface) {
        properties = iface.getProperties().map((prop) => {
          const propDocs = prop.getJsDocs();
          const rawPropDesc = propDocs[0]?.getDescription()?.trim();
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
      name,
      kind,
      description,
      properties,
      isExported: node.isExported(),
    };
  };

  const extractModuleInfo = (sourceFile: SourceFile): ModuleInfo => {
    const functions: FunctionSignature[] = [];
    const types: TypeDefinition[] = [];

    // Extract function declarations
    for (const func of sourceFile.getFunctions()) {
      const sig = extractFunctionSignature(func);
      if (sig?.isExported) functions.push(sig);
    }

    // Extract arrow function variables (project convention prefers arrow functions)
    for (const decl of sourceFile.getVariableDeclarations()) {
      const sig = extractArrowFunction(decl);
      if (sig?.isExported) functions.push(sig);
    }

    // Extract interfaces
    for (const iface of sourceFile.getInterfaces()) {
      const type = extractTypeDefinition(iface);
      if (type?.isExported) types.push(type);
    }

    // Extract type aliases
    for (const alias of sourceFile.getTypeAliases()) {
      const type = extractTypeDefinition(alias);
      if (type?.isExported) types.push(type);
    }

    const exports = [...sourceFile.getExportedDeclarations().keys()];
    const imports = sourceFile.getImportDeclarations().map((imp) => ({
      module: imp.getModuleSpecifierValue(),
      names: imp.getNamedImports().map((ni) => ni.getName()),
    }));

    return {
      path: sourceFile.getFilePath(),
      relativePath: sourceFile.getFilePath(),
      functions,
      types,
      exports,
      imports,
    };
  };

  return {
    extractModuleInfo,
    extractFunctionSignature,
    extractTypeDefinition,
  };
};
