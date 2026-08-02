import * as z from "zod";

import {
  RecallQuerySideSchema,
  RecallVariantTypeSchema,
  TokenTypeSchema,
} from "#/schema/enum.ts";
import { NormalizedLanguageIdSchema } from "#/schema/language-analysis.ts";
import {
  type CanonicalInputVersion,
  computeCanonicalInputVersion,
} from "#/schema/recall-derivation.ts";

const MemoryCanonicalStringSchema = z.strictObject({
  id: z.int().positive(),
  value: z.string(),
  languageId: NormalizedLanguageIdSchema,
});

export const MemoryCanonicalSnapshotSchema = z.strictObject({
  id: z.int().positive(),
  memoryId: z.uuidv4(),
  creatorId: z.uuidv4().nullable(),
  sourceElementId: z.int().positive().nullable(),
  translationId: z.int().positive().nullable(),
  source: MemoryCanonicalStringSchema,
  translation: MemoryCanonicalStringSchema,
});

export type MemoryCanonicalSnapshot = z.infer<
  typeof MemoryCanonicalSnapshotSchema
>;

const MemoryCanonicalInputSchema = z.strictObject({
  contract: z.literal("cat.memory-recall-canonical/v1"),
  memoryId: z.uuidv4(),
  source: z.strictObject({
    value: z.string(),
    languageId: NormalizedLanguageIdSchema,
  }),
  translation: z.strictObject({
    value: z.string(),
    languageId: NormalizedLanguageIdSchema,
  }),
});

export const computeMemoryCanonicalInputVersion = async (
  snapshot: MemoryCanonicalSnapshot,
): Promise<CanonicalInputVersion> =>
  await computeCanonicalInputVersion(
    MemoryCanonicalInputSchema.parse({
      contract: "cat.memory-recall-canonical/v1",
      memoryId: snapshot.memoryId,
      source: {
        value: snapshot.source.value,
        languageId: snapshot.source.languageId,
      },
      translation: {
        value: snapshot.translation.value,
        languageId: snapshot.translation.languageId,
      },
    }),
  );

const MemoryDeletionCanonicalInputSchema = z.strictObject({
  contract: z.literal("cat.memory-recall-tombstone/v1"),
  targetId: z.string().regex(/^\d+$/),
  memoryId: z.uuidv4(),
  languageIds: z.array(NormalizedLanguageIdSchema).min(1),
});

export const computeMemoryDeletionCanonicalInputVersion = async (input: {
  targetId: string;
  memoryId: string;
  languageIds: readonly string[];
}): Promise<CanonicalInputVersion> =>
  await computeCanonicalInputVersion(
    MemoryDeletionCanonicalInputSchema.parse({
      contract: "cat.memory-recall-tombstone/v1",
      targetId: input.targetId,
      memoryId: input.memoryId,
      languageIds: [...new Set(input.languageIds)].sort(),
    }),
  );

export const MemoryRecallVariantMetaSchema = z.union([
  z.strictObject({ windowSize: z.int().min(2) }),
  z.strictObject({
    template: z.string(),
    sourceTemplate: z.string(),
    translationTemplate: z.string(),
    slotMapping: z.array(
      z.strictObject({
        placeholder: z.string(),
        value: z.string(),
        tokenType: TokenTypeSchema,
      }),
    ),
  }),
]);

export type MemoryRecallVariantMeta = z.infer<
  typeof MemoryRecallVariantMetaSchema
>;

export const MemoryRecallVariantDraftSchema = z.strictObject({
  querySide: RecallQuerySideSchema,
  text: z.string(),
  normalizedText: z.string(),
  variantType: RecallVariantTypeSchema,
  meta: MemoryRecallVariantMetaSchema.nullable(),
});

export type MemoryRecallVariantDraft = z.infer<
  typeof MemoryRecallVariantDraftSchema
>;
