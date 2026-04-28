import { z } from "zod";

// ── Section config (shared between AutodocConfig and SubjectIR) ───────────────

export const SectionConfigSchema = z.object({
  /** @zh 稳定的 section 唯一标识符 @en Stable unique section identifier */
  id: z.string(),
  /** @zh 双语标题 @en Bilingual title */
  title: z.object({ zh: z.string(), en: z.string() }),
  /** @zh 渲染排序（升序） @en Render order (ascending) */
  order: z.int().positive(),
  /** @zh 是否在站点导航中可见 @en Whether this section is visible in site navigation */
  public: z.boolean(),
});

export type SectionConfig = z.infer<typeof SectionConfigSchema>;

/** @zh sections 文件默认导出的结构（sections 数组）@en Shape of a sections file default export */
export const SectionsFileSchema = z.array(SectionConfigSchema);
export type SectionsFile = z.infer<typeof SectionsFileSchema>;

// ── Package reference config ──────────────────────────────────────────────────

export const PackageConfigSchema = z.object({
  path: z.string(),
  name: z.string(),
  priority: z.enum(["high", "medium", "low"]).default("medium"),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
});

export type PackageConfig = z.infer<typeof PackageConfigSchema>;

// ── Structured asset (allowlisted Zod schema files) ───────────────────────────

export const StructuredAssetConfigSchema = z.object({
  /** @zh 所属 package 名称 @en Package name */
  package: z.string(),
  /** @zh 相对于 workspace root 的文件路径 @en File path relative to workspace root */
  file: z.string(),
});

export type StructuredAssetConfig = z.infer<typeof StructuredAssetConfigSchema>;

// ── Overview section schemas ──────────────────────────────────────────────────

const OverviewLinksSectionSchema = z.object({
  type: z.literal("links"),
  heading: z.string(),
  items: z.array(
    z.object({
      label: z.string(),
      description: z.string(),
      href: z.string().optional(),
    }),
  ),
});

const OverviewPackagesSectionSchema = z.object({
  type: z.literal("packages"),
  heading: z.string(),
  priorities: z
    .array(z.enum(["high", "medium", "low"]))
    .optional()
    .default(["high", "medium", "low"]),
});

const OverviewCodeSectionSchema = z.object({
  type: z.literal("code"),
  heading: z.string(),
  language: z.string().optional().default(""),
  content: z.string(),
});

const OverviewSectionSchema = z.discriminatedUnion("type", [
  OverviewLinksSectionSchema,
  OverviewPackagesSectionSchema,
  OverviewCodeSectionSchema,
]);

// ── LlmsTxt featured package schema ──────────────────────────────────────────

const LlmsTxtFeaturedPackageSchema = z.object({
  package: z.string(),
  heading: z.string().optional(),
  summary: z.string(),
  stats: z
    .array(
      z.object({
        label: z.string(),
        kinds: z
          .array(z.enum(["function", "interface", "type", "enum", "const"]))
          .optional(),
        pathIncludes: z.string().optional(),
      }),
    )
    .optional()
    .default([]),
});

// ── 2.0 AutodocConfig ─────────────────────────────────────────────────────────

export const AutodocConfigSchema = z.object({
  /**
   * @zh Reference source：扫描的 package 列表。
   * @en Reference sources: list of packages to scan.
   */
  packages: z.array(PackageConfigSchema),

  output: z.object({
    path: z.string().default("autodoc"),
    format: z.enum(["markdown", "json"]).default("markdown"),
  }),

  project: z
    .object({
      name: z.string(),
      summary: z.string().optional(),
    })
    .optional(),

  packageDocs: z
    .object({
      stripPrefix: z.string().optional(),
    })
    .optional(),

  readmeGlobs: z.array(z.string()).optional(),

  overview: z
    .object({
      title: z.string().optional(),
      sections: z.array(OverviewSectionSchema).optional().default([]),
    })
    .optional(),

  llmsTxt: z.object({
    enabled: z.boolean().default(true),
    title: z.string().optional(),
    summary: z.string().optional(),
    projectInfo: z.array(z.string()).optional().default([]),
    featuredPackages: z
      .array(LlmsTxtFeaturedPackageSchema)
      .optional()
      .default([]),
  }),

  catalog: z
    .object({
      directory: z.string().default("catalog"),
      subjectsFile: z.string().default("subjects.json"),
      referencesFile: z.string().default("references.json"),
      findingsFile: z.string().default("findings.json"),
    })
    .optional(),

  validation: z
    .object({
      semantic: z
        .object({
          validatePrimaryLanguage: z.boolean().default(false),
        })
        .optional(),
    })
    .optional(),

  /**
   * @zh Glob 模式，用于匹配 subject manifest 文件（*.subject.ts）。
   * @en Glob pattern(s) for subject manifest files (*.subject.ts).
   */
  subjects: z.union([z.string(), z.array(z.string())]).optional(),

  /**
   * @zh Section 配置：相对于 workspace root 的路径，或直接内联的 section 数组。
   * @en Sections config: a path to a sections file (relative to workspace root) or an inline section array.
   */
  sections: z.union([z.string(), z.array(SectionConfigSchema)]).optional(),

  /**
   * @zh Glob 模式列表，用于匹配语义片段文件（*.semantic.md）。
   * @en Glob pattern(s) for semantic fragment files (*.semantic.md).
   */
  fragments: z.array(z.string()).optional(),

  /**
   * @zh 已纳入 allowlist 的 Zod schema 资产，首期仅支持此类结构化资产。
   * @en Allowlisted Zod schema assets. Only this asset type is supported in v2.
   */
  structuredAssets: z.array(StructuredAssetConfigSchema).optional(),
});

export type AutodocConfig = z.infer<typeof AutodocConfigSchema>;

/**
 * @zh 定义 autodoc 配置的帮助函数，提供类型推导。
 * @en Helper for defining autodoc config with full type inference.
 */
export const defineConfig = (config: AutodocConfig): AutodocConfig => config;

// ── Subject manifest ──────────────────────────────────────────────────────────

export const PublicationMemberConfigSchema = z.object({
  /**
   * @zh 成员类型：package 边界、subsystem 边界或 allowlisted Zod schema 文档。
   * @en Member type: package boundary, subsystem boundary, or allowlisted Zod schema doc.
   */
  type: z.enum(["package", "subsystem", "zodSchema"]),
  /**
   * @zh 对应的引用标识（package 名、subsystem 名，或 "file:SchemaName"）。
   * @en Reference identifier (package name, subsystem name, or "file:SchemaName").
   */
  ref: z.string(),
});

export type PublicationMemberConfig = z.infer<
  typeof PublicationMemberConfigSchema
>;

export const SubjectManifestConfigSchema = z.object({
  /** @zh 全局唯一 subject ID @en Globally unique subject ID */
  id: z.string().min(1),
  /** @zh 双语标题 @en Bilingual title */
  title: z.object({ zh: z.string(), en: z.string() }),
  /** @zh 所属 section ID（必须在 sections 配置中存在） @en Section ID (must exist in the sections config) */
  section: z.string().min(1),
  /** @zh 主 owner package 名称 @en Primary owner package name */
  primaryOwner: z.string().min(1),
  /** @zh 次要关联 package 名称列表 @en Secondary association package names */
  secondaryAssociations: z.array(z.string()).optional().default([]),
  /** @zh 发布成员列表 @en Publication members */
  members: z.array(PublicationMemberConfigSchema).optional().default([]),
  /**
   * @zh 语义片段来源（README 锚点模式 或 *.semantic.md 路径）。
   * @en Semantic fragment sources (README anchor patterns or *.semantic.md paths).
   */
  semanticFragments: z.array(z.string()).optional().default([]),
  /** @zh 依赖的其他 subject ID @en Other subject IDs this subject depends on */
  dependsOn: z.array(z.string()).optional().default([]),
  /** @zh 是否在站点中公开 @en Whether this subject is public in the site */
  public: z.boolean().optional().default(true),
});

export type SubjectManifestConfig = z.infer<typeof SubjectManifestConfigSchema>;

/**
 * @zh 定义 subject manifest 的帮助函数，提供类型推导。
 * @en Helper for defining a subject manifest with full type inference.
 */
export const defineSubject = (
  config: SubjectManifestConfig,
): SubjectManifestConfig => config;
