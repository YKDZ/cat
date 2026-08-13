import * as z from "zod";

const SpacyRuntimeAssetSchema = z.strictObject({
  id: z.string().min(1),
  version: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});

const SpacyGenerationSchema = z.strictObject({
  id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  planDigest: z.string().regex(/^[a-f0-9]{64}$/),
  schemaVersion: z.string().min(1),
  provisionerVersion: z.string().min(1),
  serverProtocolVersion: z.string().min(1),
  pythonAbi: z.string().min(1),
  pythonImplementation: z.string().min(1),
  pythonVersion: z.string().min(1),
  platform: z.string().min(1),
  spacyVersion: z.string().min(1),
  sitePackagesDigest: z.string().regex(/^[a-f0-9]{64}$/),
});

export const SpacyRuntimeAttestationSchema = z.strictObject({
  contract: z.literal("cat.language-analysis/v1"),
  languageId: z.string().min(1),
  generation: SpacyGenerationSchema,
  semanticConfig: z.record(z.string(), z.json()),
  engine: z.strictObject({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  pipeline: z.strictObject({
    id: z.string().min(1),
    version: z.string().min(1),
  }),
  model: z.strictObject({ id: z.string().min(1), version: z.string().min(1) }),
  assets: z.array(SpacyRuntimeAssetSchema).min(1),
});

export const SpacyTokenResponseSchema = z.strictObject({
  text: z.string(),
  lemma: z.string(),
  pos: z.string(),
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
  isStop: z.boolean(),
  isPunct: z.boolean(),
});

export const SpacySentenceResponseSchema = z.strictObject({
  text: z.string(),
  start: z.int().nonnegative(),
  end: z.int().nonnegative(),
  tokens: z.array(SpacyTokenResponseSchema),
});

export const SpacyLanguageAnalysisResponseSchema = z.strictObject({
  sentences: z.array(SpacySentenceResponseSchema),
  tokens: z.array(SpacyTokenResponseSchema),
  runtimeAttestation: SpacyRuntimeAttestationSchema,
});

export const SpacyLanguageAnalysisBatchResponseSchema = z.strictObject({
  runtimeAttestation: SpacyRuntimeAttestationSchema,
  results: z.array(
    z.strictObject({
      id: z.string(),
      result: SpacyLanguageAnalysisResponseSchema,
    }),
  ),
});

export const SpacyCapabilitiesResponseSchema = z.strictObject({
  generation: SpacyGenerationSchema,
  engine: z.strictObject({
    name: z.string().min(1),
    version: z.string().min(1),
  }),
  languages: z.array(z.looseObject({ languageId: z.string().min(1) })),
});

export type SpacyTokenResponse = z.infer<typeof SpacyTokenResponseSchema>;
export type SpacyLanguageAnalysisResponse = z.infer<
  typeof SpacyLanguageAnalysisResponseSchema
>;
export type SpacyRuntimeAttestation = z.infer<
  typeof SpacyRuntimeAttestationSchema
>;
