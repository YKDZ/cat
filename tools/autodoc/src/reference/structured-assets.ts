import type { SourceFile, Node as TsMorphNode } from "ts-morph";

import { SyntaxKind, Node } from "ts-morph";

/**
 * @zh Allowlisted Zod 结构化资产条目。
 * @en An allowlisted Zod structured asset entry.
 */
export interface ZodSchemaAsset {
  /** @zh 导出名称 @en Exported name */
  exportName: string;
  /** @zh 相对于 workspace root 的源文件路径 @en Source file path relative to workspace root */
  filePath: string;
  /** @zh 起始行号（1-based） @en Start line number (1-based) */
  line: number;
  /** @zh 推断的 Zod 根调用（object/union/array 等） @en Inferred Zod root call (object/union/array etc.) */
  zodCall: string;
}

/**
 * @zh 判断一个变量声明是否为顶层 Zod schema 构造。
 * 只识别 z.object/z.union/z.array/z.string 等直接 z.xxx() 调用。
 *
 * @en Determine whether a variable declaration is a top-level Zod schema construction.
 * Only recognises direct z.xxx() call expressions.
 */
const isZodSchemaCall = (
  initializer: TsMorphNode | undefined,
): string | null => {
  if (!initializer) return null;
  if (!Node.isCallExpression(initializer)) return null;

  const expr = initializer.getExpression();
  if (!Node.isPropertyAccessExpression(expr)) return null;

  const obj = expr.getExpression();
  if (!Node.isIdentifier(obj)) return null;
  if (obj.getText() !== "z") return null;

  return expr.getName(); // e.g. "object", "union", "array"
};

/**
 * @zh 从源文件中提取所有公开导出的 Zod schema 资产（仅支持顶层 z.xxx() 调用）。
 * @en Extract all publicly exported Zod schema assets from a source file (top-level z.xxx() only).
 */
export const extractZodSchemaAssets = (
  sf: SourceFile,
  workspaceRoot = "",
): ZodSchemaAsset[] => {
  const assets: ZodSchemaAsset[] = [];
  const relPath = workspaceRoot
    ? sf.getFilePath().replace(workspaceRoot + "/", "")
    : sf.getFilePath();

  for (const stmt of sf.getVariableStatements()) {
    // Must be exported
    if (!stmt.hasModifier(SyntaxKind.ExportKeyword)) continue;

    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      const zodType = isZodSchemaCall(
        init as Parameters<typeof isZodSchemaCall>[0],
      );
      if (!zodType) continue;

      assets.push({
        exportName: decl.getName(),
        filePath: relPath,
        line: decl.getStartLineNumber(),
        zodCall: zodType,
      });
    }
  }

  return assets;
};
