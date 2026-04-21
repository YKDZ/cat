import type { SymbolIR } from "../ir.js";

/**
 * @zh 从 SymbolIR 生成签名快照字符串，用于跨版本签名漂移检测。
 * 快照只包含签名的稳定结构部分：函数参数类型和返回类型（不含 JSDoc 内容）。
 *
 * @en Generate a signature snapshot string from a SymbolIR for cross-version drift detection.
 * The snapshot captures only stable structural parts: parameter types and return type
 * (excluding JSDoc content).
 */
export const buildSignatureSnapshot = (sym: SymbolIR): string => {
  const parts: string[] = [sym.kind];

  if (sym.kind === "function") {
    const paramTypes = (sym.parameters ?? [])
      .map((p) => `${p.optional ? "?" : ""}${p.type}`)
      .join(",");
    const ret = sym.returnType ?? "void";
    parts.push(`(${paramTypes})=>${ret}`);
  } else if (sym.kind === "interface" || sym.kind === "type") {
    const propNames = (sym.properties ?? []).map((p) => p.name).sort();
    parts.push(`{${propNames.join(",")}}`);
  } else if (sym.kind === "enum") {
    parts.push(sym.name);
  } else {
    parts.push(sym.name);
  }

  return parts.join(":");
};

/**
 * @zh 比较两个快照是否存在签名漂移（结构变化）。
 * 返回漂移描述字符串，无漂移返回 null。
 * @en Compare two snapshots to detect signature drift (structural change).
 * Returns a drift description string, or null if no drift.
 */
export const detectSignatureDrift = (
  previousSnapshot: string,
  currentSnapshot: string,
): string | null => {
  if (previousSnapshot === currentSnapshot) return null;
  return `signature changed: ${previousSnapshot} → ${currentSnapshot}`;
};
