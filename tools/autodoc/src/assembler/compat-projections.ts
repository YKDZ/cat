import type { SymbolIndexEntry } from "../ir-index.js";
import type { ReferenceCatalog } from "../reference/compiler.js";
import type { AutodocConfig } from "../types.js";

import { buildIndex } from "../ir-index.js";
import { createLlmsTxtRenderer } from "../renderer/llms-txt-renderer.js";
import { createOverviewRenderer } from "../renderer/overview-renderer.js";
import { createPackageRenderer } from "../renderer/package-renderer.js";

/**
 * @zh 兼容投影的集合输出。
 * @en Collected compat projection outputs.
 */
export interface CompatProjections {
  /** @zh overview.md 内容 @en overview.md content */
  overviewMd: string;
  /** @zh llms.txt 内容（仅在 config.llmsTxt.enabled 时存在） @en llms.txt content (only when enabled) */
  llmsTxt: string | null;
  /** @zh 每个 package 的短名 → .md 内容映射 @en Short name → .md content per package */
  packagePages: Map<string, string>;
  /**
   * @zh .symbol-index.json 条目列表（来自 ReferenceCatalog 投影）。
   * @en .symbol-index.json entries (projected from ReferenceCatalog).
   */
  symbolIndex: SymbolIndexEntry[];
}

/**
 * @zh 从 ReferenceCatalog + config 生成所有兼容投影产物。
 * @en Generate all compat projection outputs from a ReferenceCatalog + config.
 */
export const buildCompatProjections = (
  config: AutodocConfig,
  referenceCatalog: ReferenceCatalog,
): CompatProjections => {
  const packages = referenceCatalog.packages;
  const overviewRenderer = createOverviewRenderer(config);
  const pkgRenderer = createPackageRenderer();
  const llmsRenderer = createLlmsTxtRenderer();

  const overviewMd = overviewRenderer.render(packages);

  const llmsTxt = config.llmsTxt.enabled ? llmsRenderer.render(packages) : null;

  const packagePages = new Map<string, string>();
  for (const pkg of packages) {
    const isHighPriority =
      config.packages.find((p) => p.name === pkg.name)?.priority === "high";
    const shortName = pkg.name.replace("@cat/", "");
    packagePages.set(
      shortName,
      pkgRenderer.renderPackage(pkg, { detailed: isHighPriority ?? false }),
    );
  }

  const symbolIndex = buildIndex(packages);

  return { overviewMd, llmsTxt, packagePages, symbolIndex };
};
