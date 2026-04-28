import { readFile, writeFile } from "node:fs/promises";
import { z } from "zod";

import type { PackageIR, SymbolIR } from "./ir.js";

const SymbolIndexEntrySchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["function", "interface", "type", "enum", "const"]),
  description: z.string().optional(),
  filePath: z.string(),
  line: z.int(),
  endLine: z.int(),
  column: z.int().optional(),
  endColumn: z.int().optional(),
  stableKey: z.string().optional(),
  packageName: z.string(),
});

/**
 * @zh 扁平化的符号索引条目（ReferenceCatalog 的兼容投影）。
 * @en Flattened symbol index entry (compatibility projection from ReferenceCatalog).
 */
export interface SymbolIndexEntry {
  /** @zh 符号唯一 ID @en Unique symbol ID */
  id: string;
  /** @zh 符号名称 @en Symbol name */
  name: string;
  /** @zh 符号类型 @en Symbol kind */
  kind: SymbolIR["kind"];
  /** @zh 符号描述 @en Symbol description */
  description?: string;
  /** @zh 符号源文件路径 @en Source file path */
  filePath: string;
  /** @zh 起始行号 @en Start line number */
  line: number;
  /** @zh 结束行号 @en End line number */
  endLine: number;
  /** @zh 起始列号（0-based） @en Start column (0-based) */
  column?: number;
  /** @zh 结束列号（0-based） @en End column (0-based) */
  endColumn?: number;
  /**
   * @zh 跨版本稳定键（对重载函数含参数类型指纹）。
   * @en Cross-version stable key (overloaded functions include a type fingerprint).
   */
  stableKey?: string;
  /** @zh 所属包名 @en Package name */
  packageName: string;
}

/**
 * @zh 从 PackageIR[] 构建扁平索引（ReferenceCatalog 兼容投影）。
 * @en Build a flat index from PackageIR[] (ReferenceCatalog compatibility projection).
 */
export const buildIndex = (packages: PackageIR[]): SymbolIndexEntry[] => {
  const entries: SymbolIndexEntry[] = [];
  for (const pkg of packages) {
    for (const mod of pkg.modules) {
      for (const sym of mod.symbols) {
        entries.push({
          id: sym.id,
          name: sym.name,
          kind: sym.kind,
          description: sym.description,
          filePath: sym.sourceLocation.filePath,
          line: sym.sourceLocation.line,
          endLine: sym.sourceLocation.endLine,
          column: sym.sourceLocation.column,
          endColumn: sym.sourceLocation.endColumn,
          stableKey: sym.stableKey,
          packageName: pkg.name,
        });
      }
    }
  }
  return entries;
};

/**
 * @zh 保存索引到 JSON 文件。
 * @en Save index to a JSON file.
 */
export const saveIndex = async (
  entries: SymbolIndexEntry[],
  outputPath: string,
): Promise<void> => {
  await writeFile(outputPath, JSON.stringify(entries), "utf-8");
};

/**
 * @zh 从 JSON 文件加载索引。
 * @en Load index from a JSON file.
 */
export const loadIndex = async (
  indexPath: string,
): Promise<SymbolIndexEntry[]> => {
  const content = await readFile(indexPath, "utf-8");
  return z.array(SymbolIndexEntrySchema).parse(JSON.parse(content));
};

/**
 * @zh 按名称或 ID 模糊查找符号，精确匹配优先。
 * @en Fuzzy find symbols by query, with exact matches first.
 */
export const findSymbols = (
  entries: SymbolIndexEntry[],
  query: string,
): SymbolIndexEntry[] => {
  const lower = query.toLowerCase();
  // Exact ID match
  const exactId = entries.filter((e) => e.id === query);
  if (exactId.length > 0) return exactId;
  // Exact name match
  const exactName = entries.filter((e) => e.name === query);
  if (exactName.length > 0) return exactName;
  // Fuzzy match (name or ID contains query)
  return entries.filter(
    (e) =>
      e.name.toLowerCase().includes(lower) ||
      e.id.toLowerCase().includes(lower),
  );
};
