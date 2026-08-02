import * as z from "zod";

import {
  RecallVariantTypeSchema,
  TermStatusSchema,
  TermTypeSchema,
} from "#/schema/enum.ts";
import { NormalizedLanguageIdSchema } from "#/schema/language-analysis.ts";
import {
  type CanonicalInputVersion,
  computeCanonicalInputVersion,
} from "#/schema/recall-derivation.ts";
import { compareCodeUnitStrings } from "#/utils/string.ts";

const TermConceptCanonicalTermSchema = z.strictObject({
  id: z.int().positive(),
  creatorId: z.uuidv4().nullable(),
  text: z.string(),
  languageId: NormalizedLanguageIdSchema,
  type: TermTypeSchema,
  status: TermStatusSchema,
});

const TermConceptCanonicalSubjectSchema = z.strictObject({
  id: z.int().positive(),
  creatorId: z.uuidv4().nullable(),
  subject: z.string(),
  defaultDefinition: z.string().nullable(),
  isPrimary: z.boolean(),
});

export const TermConceptCanonicalSnapshotSchema = z.strictObject({
  id: z.int().positive(),
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().nullable(),
  definition: z.string().nullable(),
  terms: z.array(TermConceptCanonicalTermSchema),
  subjects: z.array(TermConceptCanonicalSubjectSchema),
});

export type TermConceptCanonicalSnapshot = z.infer<
  typeof TermConceptCanonicalSnapshotSchema
>;

const TermConceptCanonicalInputSchema = z.strictObject({
  contract: z.literal("cat.glossary-recall-canonical/v1"),
  languageId: NormalizedLanguageIdSchema,
  terms: z.array(
    TermConceptCanonicalTermSchema.pick({
      id: true,
      text: true,
      languageId: true,
    }),
  ),
});

export const computeTermConceptCanonicalInputVersion = async (
  snapshot: TermConceptCanonicalSnapshot,
  languageId: string,
): Promise<CanonicalInputVersion> =>
  await computeCanonicalInputVersion(
    TermConceptCanonicalInputSchema.parse({
      contract: "cat.glossary-recall-canonical/v1",
      languageId,
      terms: snapshot.terms
        .filter((term) => term.languageId === languageId)
        .map(({ id, text, languageId: termLanguageId }) => ({
          id,
          text,
          languageId: termLanguageId,
        }))
        .sort(
          (left, right) =>
            left.id - right.id ||
            compareCodeUnitStrings(left.text, right.text) ||
            compareCodeUnitStrings(left.languageId, right.languageId),
        ),
    }),
  );

const TermConceptDeletionCanonicalInputSchema = z.strictObject({
  contract: z.literal("cat.glossary-recall-tombstone/v1"),
  targetId: z.string().regex(/^\d+$/),
  glossaryId: z.uuidv4(),
  languageIds: z.array(NormalizedLanguageIdSchema).min(1),
});

export const computeTermConceptDeletionCanonicalInputVersion = async (input: {
  targetId: string;
  glossaryId: string;
  languageIds: readonly string[];
}): Promise<CanonicalInputVersion> =>
  await computeCanonicalInputVersion(
    TermConceptDeletionCanonicalInputSchema.parse({
      contract: "cat.glossary-recall-tombstone/v1",
      targetId: input.targetId,
      glossaryId: input.glossaryId,
      languageIds: [...new Set(input.languageIds)].sort(),
    }),
  );

export const TermRecallVariantMetaSchema = z.strictObject({
  sourceTermId: z.int().positive(),
  windowSize: z.int().min(2).optional(),
});

export type TermRecallVariantMeta = z.infer<typeof TermRecallVariantMetaSchema>;

export const TermRecallVariantDraftSchema = z.strictObject({
  text: z.string(),
  normalizedText: z.string(),
  variantType: RecallVariantTypeSchema,
  meta: TermRecallVariantMetaSchema,
});

export type TermRecallVariantDraft = z.infer<
  typeof TermRecallVariantDraftSchema
>;

export const GlossaryTermMaterializationSchema = z.strictObject({
  id: z.int().positive(),
  termConceptId: z.int().positive(),
  creatorId: z.uuidv4().nullable(),
  text: z.string(),
  languageId: NormalizedLanguageIdSchema,
  type: TermTypeSchema,
  status: TermStatusSchema,
});

export const GlossaryConceptMaterializationSchema = z.strictObject({
  concept: z.strictObject({
    id: z.int().positive(),
    glossaryId: z.uuidv4(),
    creatorId: z.uuidv4().nullable(),
    definition: z.string().nullable(),
  }),
  terms: z.array(GlossaryTermMaterializationSchema),
  subjects: z.array(
    z.strictObject({
      subjectId: z.int().positive(),
      isPrimary: z.boolean(),
    }),
  ),
});

export type GlossaryConceptMaterialization = z.infer<
  typeof GlossaryConceptMaterializationSchema
>;
