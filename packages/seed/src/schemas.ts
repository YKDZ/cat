import { RelationSchema } from "@cat/shared";
import { safeZDotJson } from "@cat/shared";
import * as z from "zod";

// ── Plugin override ──────────────────────────────────────────────────

export const PluginOverrideSchema = z.object({
  plugin: z.string(),
  scope: z.enum(["GLOBAL", "PROJECT", "USER"]),
  scopeId: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
});

export type PluginOverride = z.infer<typeof PluginOverrideSchema>;

// ── Seed file references ─────────────────────────────────────────────

export const SeedConfigSchema = z.object({
  project: z.string(),
  users: z.string().optional(),
  glossary: z.string().optional(),
  memory: z.string().optional(),
  elements: z.string().optional(),
  plugins: z.string().optional(),
  agentDefinition: z.string().optional(),
});

export type SeedConfig = z.infer<typeof SeedConfigSchema>;

// ── Seed data schemas ────────────────────────────────────────────────

export const ProjectSeedSchema = z.object({
  name: z.string().min(1),
  sourceLanguage: z.string(),
  translationLanguages: z.array(z.string()).min(1),
});

export type ProjectSeed = z.infer<typeof ProjectSeedSchema>;

export const GlossaryConceptSeedSchema = z.object({
  ref: z.string(),
  definition: z.string(),
  terms: z
    .array(
      z.object({
        term: z.string(),
        termLanguageId: z.string(),
        translation: z.string(),
        translationLanguageId: z.string(),
      }),
    )
    .min(1),
});

export const GlossarySeedSchema = z.object({
  glossary: z.object({
    name: z.string(),
    sourceLanguage: z.string(),
    translationLanguage: z.string(),
    concepts: z.array(GlossaryConceptSeedSchema).min(1),
  }),
});

export type GlossarySeed = z.infer<typeof GlossarySeedSchema>;
export type GlossaryConceptSeed = z.infer<typeof GlossaryConceptSeedSchema>;

export const MemoryItemSeedSchema = z.object({
  ref: z.string(),
  source: z.string(),
  translation: z.string(),
  sourceLanguage: z.string(),
  translationLanguage: z.string(),
});

export const MemorySeedSchema = z.object({
  memory: z.object({
    name: z.string(),
    items: z.array(MemoryItemSeedSchema).min(1),
  }),
});

export type MemorySeed = z.infer<typeof MemorySeedSchema>;
export type MemoryItemSeed = z.infer<typeof MemoryItemSeedSchema>;

export const ElementSeedSchema = z.object({
  ref: z.string(),
  text: z.string(),
  context: z
    .array(z.union([z.string(), z.record(z.string(), z.unknown())]))
    .optional(),
  meta: safeZDotJson.optional(),
});

export const ElementsSeedSchema = z.object({
  contentNodeLabel: z.string().min(1).default("content-node"),
  elements: z.array(ElementSeedSchema).min(1),
});

export type ElementsSeed = z.infer<typeof ElementsSeedSchema>;
export type ElementSeed = z.infer<typeof ElementSeedSchema>;

export const PluginSeedSchema = z.object({
  plugins: z.array(
    z.object({
      pluginId: z.string(),
      scope: z.enum(["GLOBAL", "PROJECT", "USER"]),
      scopeId: z.string().optional(),
      config: z.record(z.string(), z.unknown()),
    }),
  ),
});

// ── User seed schema ─────────────────────────────────────────────────

export const UserSeedSchema = z.object({
  users: z.array(
    z.object({
      ref: z.string(),
      email: z.email(),
      name: z.string(),
      password: z.string(),
      role: RelationSchema.optional(),
    }),
  ),
});

export type UserSeed = z.infer<typeof UserSeedSchema>;

/**
 * @zh Bootstrap locale catalog 文件映射。
 * @en Bootstrap locale catalog file mapping.
 */
export const BootstrapLocaleCatalogSchema = z.object({
  path: z.string().min(1),
  localeId: z.string().min(1),
  languageId: z.string().min(1),
});

/**
 * @zh Bootstrap 源采集配置。
 * @en Bootstrap source collection configuration.
 */
export const BootstrapSourceProfileSchema = z.object({
  baseDir: z.string().min(1),
  globs: z.array(z.string().min(1)).min(1),
  extractor: z.literal("vue-i18n").default("vue-i18n"),
  parseFailureTolerance: z.int().min(0).default(0),
});

/**
 * @zh Bootstrap 截图配置。
 * @en Bootstrap screenshot configuration.
 */
export const BootstrapScreenshotProfileSchema = z.object({
  routes: z.string().min(1),
  strict: z.boolean().default(false),
  minScreenshots: z.int().min(0).default(0),
});

/**
 * @zh Bootstrap 报告输出配置。
 * @en Bootstrap report output configuration.
 */
export const BootstrapReportProfileSchema = z.object({
  output: z.string().min(1).default("artifacts/bootstrap-report.json"),
});

/**
 * @zh Bootstrap profile schema。
 * @en Bootstrap profile schema.
 */
export const BootstrapProfileSchema = z.object({
  enabled: z.boolean().default(false),
  importerId: z.string().min(1).default("cat-app-vue-i18n"),
  sourceRootRef: z.string().min(1).default("cat-app-source"),
  sourceLanguageId: z.string().min(1),
  targetLanguageIds: z.array(z.string().min(1)).min(1),
  source: BootstrapSourceProfileSchema,
  localeCatalogs: z.array(BootstrapLocaleCatalogSchema).default([]),
  failOnZeroElements: z.boolean().default(true),
  report: BootstrapReportProfileSchema.default({
    output: "artifacts/bootstrap-report.json",
  }),
  screenshots: BootstrapScreenshotProfileSchema.optional(),
});

/**
 * @zh Bootstrap locale catalog 类型。
 * @en Bootstrap locale catalog type.
 */
export type BootstrapLocaleCatalog = z.infer<
  typeof BootstrapLocaleCatalogSchema
>;

/**
 * @zh Bootstrap profile 类型。
 * @en Bootstrap profile type.
 */
export type BootstrapProfile = z.infer<typeof BootstrapProfileSchema>;

// ── Dev seed config (seed.yaml) ──────────────────────────────────────

export const DevSeedConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  seed: SeedConfigSchema,
  vectorization: z
    .object({
      enabled: z.boolean().default(true),
    })
    .default({ enabled: true }),
  plugins: z.object({
    loader: z.enum(["real", "test"]).default("real"),
    overrides: z.array(PluginOverrideSchema).default([]),
  }),
  bootstrap: BootstrapProfileSchema.optional(),
});

export type DevSeedConfig = z.infer<typeof DevSeedConfigSchema>;
