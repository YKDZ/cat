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
  documentName: z.string().min(1).default("document"),
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
});

export type DevSeedConfig = z.infer<typeof DevSeedConfigSchema>;
