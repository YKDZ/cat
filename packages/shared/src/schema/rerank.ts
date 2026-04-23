import * as z from "zod";

export const RerankTriggerSchema = z.enum([
  "precision-ambiguity",
  "context-route",
]);

export const RerankSurfaceSchema = z.enum(["term", "memory"]);

export const RerankBandSchema = z.object({
  start: z.int().min(0),
  /** Exclusive slice end; matches Array.prototype.slice(start, end). */
  end: z.int().min(0),
  reasons: z.array(z.string()).default([]),
  anchorCandidateId: z.string().optional(),
});

export const RerankContextHintsSchema = z.object({
  neighborSources: z.array(z.string()).default([]),
  approvedNeighborTranslations: z.array(z.string()).default([]),
  conceptContextSummary: z.string().optional(),
});

export const RerankCandidateDocumentSchema = z.object({
  candidateId: z.string(),
  surface: RerankSurfaceSchema,
  originalIndex: z.int().min(0),
  originalConfidence: z.number().min(0).max(1),
  title: z.string(),
  sourceText: z.string(),
  targetText: z.string().optional(),
  definitionText: z.string().optional(),
  contextText: z.string().optional(),
});

export const RerankRequestSchema = z.object({
  trigger: RerankTriggerSchema,
  surface: RerankSurfaceSchema,
  queryText: z.string(),
  band: RerankBandSchema,
  candidates: z.array(RerankCandidateDocumentSchema).min(1),
  contextHints: RerankContextHintsSchema.optional(),
  rerankProviderId: z.int().optional(),
  timeoutMs: z.int().positive().optional(),
});

export type RerankProviderCall = {
  request: z.infer<typeof RerankRequestSchema>;
  signal?: AbortSignal;
};

export const RerankScoreEntrySchema = z.object({
  candidateId: z.string(),
  score: z.number(),
});

export const RerankProviderMetadataSchema = z.object({
  providerId: z.string().optional(),
  modelId: z.string().optional(),
  endpoint: z.string().optional(),
  latencyMs: z.number().nonnegative().optional(),
  status: z.string().optional(),
});

export const RerankResponseSchema = z.object({
  scores: z.array(RerankScoreEntrySchema),
  metadata: RerankProviderMetadataSchema.optional(),
});

export const RerankDecisionTraceSchema = z.object({
  trigger: RerankTriggerSchema,
  outcome: z.enum([
    "applied",
    "skipped",
    "unavailable",
    "timeout",
    "cancelled",
    "invalid-response",
    "fail-closed",
  ]),
  band: RerankBandSchema.optional(),
  message: z.string(),
  metadata: RerankProviderMetadataSchema.optional(),
});

export type RerankRequest = z.infer<typeof RerankRequestSchema>;
export type RerankResponse = z.infer<typeof RerankResponseSchema>;
export type RerankDecisionTrace = z.infer<typeof RerankDecisionTraceSchema>;
export type RerankCandidateDocument = z.infer<
  typeof RerankCandidateDocumentSchema
>;
export type RerankBand = z.infer<typeof RerankBandSchema>;
