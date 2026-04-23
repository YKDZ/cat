import * as z from "zod";

const UuidSchema = z.uuidv4();

const RecallEvidenceSchema = z.object({
  channel: z.string(),
  matchedText: z.string().optional(),
  matchedVariantText: z.string().optional(),
  matchedVariantType: z.string().optional(),
  confidence: z.number().optional(),
  note: z.string().optional(),
});

const NlpTokenSchema = z.object({
  text: z.string(),
  lemma: z.string(),
  pos: z.string(),
  start: z.int(),
  end: z.int(),
  isStop: z.boolean(),
  isPunct: z.boolean(),
});

const TokenizerTokenSchema = z.object({
  type: z.string(),
  value: z.string(),
  start: z.int(),
  end: z.int(),
});

const TermResultSchema = z.object({
  term: z.string(),
  translation: z.string(),
  confidence: z.number(),
  definition: z.string().nullable(),
  conceptId: z.int(),
  glossaryId: UuidSchema,
  matchedText: z.string().optional(),
  evidences: z.array(RecallEvidenceSchema),
});

const MemoryResultSchema = z.object({
  id: z.int(),
  source: z.string(),
  translation: z.string(),
  translationChunkSetId: z.int().nullable(),
  memoryId: UuidSchema,
  creatorId: UuidSchema.nullable(),
  confidence: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  sourceTemplate: z.string().nullable().optional(),
  translationTemplate: z.string().nullable().optional(),
  slotMapping: z
    .array(
      z.object({
        placeholder: z.string(),
        value: z.string(),
        tokenType: z.string(),
      }),
    )
    .nullable()
    .optional(),
  matchedText: z.string().optional(),
  matchedVariantText: z.string().optional(),
  matchedVariantType: z.string().optional(),
  adaptedTranslation: z.string().nullable().optional(),
  adaptationMethod: z
    .enum(["exact", "token-replaced", "llm-adapted"])
    .optional(),
  evidences: z.array(RecallEvidenceSchema),
});

export const RecallFixtureSchema = z.object({
  name: z.string(),
  description: z.string(),
  kind: z.enum(["term", "memory"]),
  matrix: z.enum(["fallback", "mock-nlp"]),
  query: z.object({
    text: z.string(),
    sourceLanguageId: z.string(),
    translationLanguageId: z.string(),
  }),
  expected: z.object({
    topId: z.int(),
    minimumTopConfidence: z.number(),
    requiredChannels: z.array(z.string()).default([]),
    requiredVariantTypes: z.array(z.string()).default([]),
    expectedTranslation: z.string().optional(),
    missIds: z.array(z.int()).default([]),
    expectedTier: z.enum(["1", "2", "3"]).optional(),
  }),
  mock: z.object({
    term: z
      .object({
        nlpTokens: z.array(NlpTokenSchema).optional(),
        lexical: z.array(TermResultSchema).default([]),
        morphological: z.array(TermResultSchema).default([]),
        semantic: z.array(TermResultSchema).default([]),
        sparse: z.array(TermResultSchema).default([]),
      })
      .optional(),
    memory: z
      .object({
        queryTokens: z.array(TokenizerTokenSchema).optional(),
        exact: z.array(MemoryResultSchema).default([]),
        trgm: z.array(MemoryResultSchema).default([]),
        variant: z.array(MemoryResultSchema).default([]),
        semantic: z.array(MemoryResultSchema).default([]),
        sparse: z.array(MemoryResultSchema).default([]),
      })
      .optional(),
  }),
});

export type RecallFixture = z.infer<typeof RecallFixtureSchema>;
