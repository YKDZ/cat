import { PluginOverrideSchema, SeedConfigSchema } from "@cat/seed";
import * as z from "zod";

// ── Re-export shared seed schemas from @cat/seed ─────────────────────
export {
  PluginOverrideSchema,
  type PluginOverride,
  SeedConfigSchema,
  ProjectSeedSchema,
  type ProjectSeed,
  GlossaryConceptSeedSchema,
  GlossarySeedSchema,
  type GlossarySeed,
  MemoryItemSeedSchema,
  MemorySeedSchema,
  type MemorySeed,
  ElementSeedSchema,
  ElementsSeedSchema,
  type ElementsSeed,
  PluginSeedSchema,
} from "@cat/seed";

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
  "decision-note",
  "latency",
  "instruction-adherence",
  "term-compliance",
  "chrf",
  "token-cost",
  "agent-latency",
]);

// ── Scenario ─────────────────────────────────────────────────────────

export const ScenarioConfigSchema = z.object({
  name: z.string().optional(),
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

// ── Test set schemas ─────────────────────────────────────────────────

export const ExpectedTermSchema = z.object({
  conceptRef: z.string(),
  term: z.string(),
  translation: z.string(),
  mustBeTopK: z.int().optional(),
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
