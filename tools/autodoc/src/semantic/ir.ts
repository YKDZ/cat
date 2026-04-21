/**
 * @zh Semantic Compiler IR — 中文语义层数据模型。
 * @en Semantic Compiler IR — data model for the Chinese semantic layer.
 */

// ── Fragment source type ───────────────────────────────────────────────────────

/** @zh 语义片段的来源类型 @en Source type for a semantic fragment */
export type FragmentSourceType = "readme-anchor" | "semantic-md";

// ── SemanticFragment ──────────────────────────────────────────────────────────

/**
 * @zh 单个语义片段 — 绑定到特定 subject 的一段中文语义文本。
 * @en A single semantic fragment — a block of (primarily Chinese) semantic text bound to a subject.
 */
export interface SemanticFragment {
  /** @zh 绑定的 subject ID @en Bound subject ID */
  subjectId: string;
  /** @zh 片段正文（Markdown） @en Fragment body (Markdown) */
  body: string;
  /**
   * @zh 源文件路径（相对于 workspace root）。
   * @en Source file path (relative to workspace root).
   */
  sourcePath: string;
  /** @zh 片段起始行号（1-based） @en Fragment start line number (1-based) */
  startLine: number;
  /** @zh 来源类型 @en Source type */
  sourceType: FragmentSourceType;
  /**
   * @zh 片段正文中明确引用的 stableKey 列表（用于 Tier-2 引用健康校验）。
   * @en stableKeys explicitly referenced in the fragment body (for Tier-2 reference health checks).
   */
  referencedStableKeys: string[];
  /**
   * @zh 片段标题（可选，`*.semantic.md` front-matter 中的 `title`）。
   * @en Optional fragment title (from `title:` in `*.semantic.md` front-matter).
   */
  title?: string;
}

// ── SemanticCatalog ────────────────────────────────────────────────────────────

/**
 * @zh 全部语义片段的汇总 — 以 subject ID 为键索引。
 * @en The complete semantic catalog — indexed by subject ID.
 */
export interface SemanticCatalog {
  /**
   * @zh 按 subject ID 查询对应的语义片段列表。
   * @en Get semantic fragments for a given subject ID.
   */
  getFragments(subjectId: string): SemanticFragment[];

  /**
   * @zh 返回拥有片段的所有 subject ID。
   * @en Return all subject IDs that have at least one fragment.
   */
  subjectIds(): string[];

  /**
   * @zh 全部片段数量（跨所有 subject）。
   * @en Total number of fragments across all subjects.
   */
  readonly fragmentCount: number;
}
