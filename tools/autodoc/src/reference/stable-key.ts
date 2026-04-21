import type { ParameterIR } from "../ir.js";

/**
 * @zh 生成稳定的符号键，对重载函数用参数类型列表做区分。
 * 普通符号的 stableKey 与 id 相同；重载符号追加括号内的参数类型指纹。
 *
 * @en Generate a stable symbol key, disambiguating overloaded functions by parameter types.
 * For non-overloaded symbols the stableKey equals the id; overloads append a parenthesised
 * type fingerprint.
 */
export const makeStableKey = (
  id: string,
  parameters?: ParameterIR[],
  isOverloaded?: boolean,
): string => {
  if (!isOverloaded) return id;
  // Always append parens for overloaded symbols, even with no parameters
  const paramFingerprint = (parameters ?? [])
    .map((p) => p.type.replace(/\s+/g, "").replace(/[^a-zA-Z0-9_<>[\]|&,().]/g, ""))
    .join(",");
  return `${id}(${paramFingerprint})`;
};

/**
 * @zh 判断同一模块内是否存在同名符号（用于检测是否需要重载区分）。
 * @en Check whether a symbol name appears multiple times in the same module (indicating overloads).
 */
export const isOverloadedInModule = (
  symbolName: string,
  allNamesInModule: string[],
): boolean => allNamesInModule.filter((n) => n === symbolName).length > 1;
