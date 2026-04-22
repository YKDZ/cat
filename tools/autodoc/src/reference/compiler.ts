import type { SymbolIndexEntry } from "../ir-index.js";
import type { PackageIR, SymbolIR } from "../ir.js";

import { buildIndex } from "../ir-index.js";

/**
 * @zh Reference Catalog — 以 PackageIR[] 为核心的引用事实模型。
 * 提供按 stableKey、id 与名称查找符号的统一 API，以及向 .symbol-index.json 的兼容投影。
 *
 * @en Reference Catalog — the reference fact model built on PackageIR[].
 * Provides a unified API for looking up symbols by stableKey, id, or name,
 * and a compatibility projection to .symbol-index.json.
 */
export class ReferenceCatalog {
  private readonly _symbolById: Map<string, SymbolIR>;
  private readonly _symbolByStableKey: Map<string, SymbolIR>;
  private readonly _symbolsByName: Map<string, SymbolIR[]>;

  constructor(public readonly packages: PackageIR[]) {
    this._symbolById = new Map();
    this._symbolByStableKey = new Map();
    this._symbolsByName = new Map();

    for (const pkg of packages) {
      for (const mod of pkg.modules) {
        for (const sym of mod.symbols) {
          this._symbolById.set(sym.id, sym);
          if (sym.stableKey) {
            this._symbolByStableKey.set(sym.stableKey, sym);
          }
          const byName = this._symbolsByName.get(sym.name) ?? [];
          byName.push(sym);
          this._symbolsByName.set(sym.name, byName);
        }
      }
    }
  }

  /** @zh 按 id 查找符号 @en Look up a symbol by id */
  resolveById(id: string): SymbolIR | undefined {
    return this._symbolById.get(id);
  }

  /** @zh 按 stableKey 查找符号 @en Look up a symbol by stableKey */
  resolveByStableKey(key: string): SymbolIR | undefined {
    return this._symbolByStableKey.get(key) ?? this._symbolById.get(key);
  }

  /** @zh 按名称查找所有匹配符号 @en Find all symbols matching a name */
  resolveByName(name: string): SymbolIR[] {
    return this._symbolsByName.get(name) ?? [];
  }

  /**
   * @zh 投影为 SymbolIndexEntry[]（兼容 .symbol-index.json）。
   * @en Project to SymbolIndexEntry[] (compatible with .symbol-index.json).
   */
  toSymbolIndex(): SymbolIndexEntry[] {
    return buildIndex(this.packages);
  }

  /** @zh 返回所有 symbol 总数 @en Return total symbol count */
  get symbolCount(): number {
    return this._symbolById.size;
  }
}

/**
 * @zh 从已扫描的 PackageIR[] 构建 ReferenceCatalog。
 * @en Build a ReferenceCatalog from already-scanned PackageIR[].
 */
export const buildReferenceCatalog = (
  packages: PackageIR[],
): ReferenceCatalog => new ReferenceCatalog(packages);
