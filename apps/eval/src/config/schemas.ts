import * as z from "zod";

// ── Plugin override ──────────────────────────────────────────────────

export const PluginOverrideSchema = z.object({
  plugin: z.string(),
  scope: z.enum(["GLOBAL", "PROJECT", "USER"]),
  scopeId: z.string().optional(),
  config: z.record(z.string(), z.unknown()),
});

// ── Seed file references ─────────────────────────────────────────────

export const SeedConfigSchema = z.object({
  project: z.string(),
  glossary: z.string().optional(),
  memory: z.string().optional(),
  elements: z.string().optional(),
  plugins: z.string().optional(),
  agentDefinition: z.string().optional(),
});

// ── Scorers ──────────────────────────────────────────────────────────

export const ScorerNameSchema = z.enum([
  "precision",
  "recall",
  "f1",
  "mrr",
  "hit-rate",
  "negative-exclusion",
  "confidence",
  "channel-coverage",
  "latency",
  "instruction-adherence",
  "term-compliance",
  "chrf",
  "token-cost",
  "agent-latency",
]);

// ── Scenario ─────────────────────────────────────────────────────────

export const ScenarioConfigSchema = z.object({
  type: z.enum(["term-recall", "memory-recall", "agent-translate"]),
  "test-set": z.string(),
  scorers: z.array(ScorerNameSchema).min(1),
  params: z.record(z.string(), z.unknown()).optional(),
});

// ── Thresholds ───────────────────────────────────────────────────────

export const ThresholdSchema = z.record(
  z.string(),
  z.string(), // e.g., ">= 0.85", "<= 200"
);

// ── Suite manifest (suite.yaml) ──────────────────────────────────────

export const SuiteConfigSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  seed: SeedConfigSchema,
  plugins: z.object({
    loader: z.enum(["real", "test"]).default("real"),
    overrides: z.array(PluginOverrideSchema).default([]),
  }),
  scenarios: z.array(ScenarioConfigSchema).min(1),
  thresholds: ThresholdSchema.optional(),
});

export type SuiteConfig = z.infer<typeof SuiteConfigSchema>;
export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;
export type PluginOverride = z.infer<typeof PluginOverrideSchema>;

// ── Seed data schemas ────────────────────────────────────────────────

export const ProjectSeedSchema = z.object({
  name: z.string().min(1),
  sourceLanguage: z.string(),
  translationLanguages: z.array(z.string()).min(1),
});

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

export const ElementSeedSchema = z.object({
  ref: z.string(),
  text: z.string(),
  context: z.union([z.string(), z.record(z.string(), z.unknown())]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const ElementsSeedSchema = z.object({
  elements: z.array(ElementSeedSchema).min(1),
});

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

// ── Test set schemas ─────────────────────────────────────────────────

export const ExpectedTermSchema = z.object({
  conceptRef: z.string(),
  term: z.string(),
  translation: z.string(),
  mustBeTopK: z.number().int().optional(),
  minimumConfidence: z.number().optional(),
  requiredChannels: z.array(z.string()).default([]),
});

export const NegativeTermSchema = z.object({
  conceptRef: z.string(),
});

export const TermRecallTestCaseSchema = z.object({
  id: z.string(),
  inputText: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  expectedTerms: z.array(ExpectedTermSchema).min(1),
  negativeTerms: z.array(NegativeTermSchema).default([]),
});

export const TermRecallTestSetSchema = z.object({
  name: z.string(),
  cases: z.array(TermRecallTestCaseSchema).min(1),
});

export const ExpectedMemorySchema = z.object({
  memoryItemRef: z.string(),
  expectedSource: z.string(),
  expectedTranslation: z.string(),
  minimumConfidence: z.number().optional(),
  requiredChannels: z.array(z.string()).default([]),
  requiredVariantTypes: z.array(z.string()).default([]),
  expectedAdaptationMethod: z
    .enum(["exact", "token-replaced", "llm-adapted"])
    .optional(),
});

export const NegativeMemorySchema = z.object({
  memoryItemRef: z.string(),
});

export const MemoryRecallTestCaseSchema = z.object({
  id: z.string(),
  inputText: z.string(),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
  expectedMemories: z.array(ExpectedMemorySchema).min(1),
  negativeMemories: z.array(NegativeMemorySchema).default([]),
});

export const MemoryRecallTestSetSchema = z.object({
  name: z.string(),
  cases: z.array(MemoryRecallTestCaseSchema).min(1),
});

export type ProjectSeed = z.infer<typeof ProjectSeedSchema>;
export type GlossarySeed = z.infer<typeof GlossarySeedSchema>;
export type MemorySeed = z.infer<typeof MemorySeedSchema>;
export type ElementsSeed = z.infer<typeof ElementsSeedSchema>;
export type TermRecallTestSet = z.infer<typeof TermRecallTestSetSchema>;
export type MemoryRecallTestSet = z.infer<typeof MemoryRecallTestSetSchema>;
export type TermRecallTestCase = z.infer<typeof TermRecallTestCaseSchema>;
export type MemoryRecallTestCase = z.infer<typeof MemoryRecallTestCaseSchema>;

// ── Translation test set schemas ──────────────────────────────────────────────

export const ReferenceTranslationSchema = z.object({
  elementRef: z.string(),
  expectedText: z.string(),
  requiredTerms: z.array(z.string()).default([]),
});

export const TranslationTestCaseSchema = z.object({
  id: z.string(),
  instruction: z.string(),
  elementRefs: z.array(z.string()).min(1),
  referenceTranslations: z.array(ReferenceTranslationSchema).min(1),
  sourceLanguage: z.string(),
  targetLanguage: z.string(),
});

export const TranslationTestSetSchema = z.object({
  name: z.string(),
  cases: z.array(TranslationTestCaseSchema).min(1),
});

export type ReferenceTranslation = z.infer<typeof ReferenceTranslationSchema>;
export type TranslationTestCase = z.infer<typeof TranslationTestCaseSchema>;
export type TranslationTestSet = z.infer<typeof TranslationTestSetSchema>;
