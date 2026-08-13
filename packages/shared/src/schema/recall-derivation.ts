import * as z from "zod";

import {
  LanguageAnalysisVersionSchema,
  NormalizedLanguageIdSchema,
  stableSerializeLanguageAnalysis,
} from "#/schema/language-analysis.ts";
import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";
import { compareCodeUnitStrings } from "#/utils/string.ts";

declare const recallDerivationVersion: unique symbol;
declare const canonicalInputVersion: unique symbol;

export type CanonicalInputVersion = string & {
  readonly [canonicalInputVersion]: "CanonicalInputVersion";
};

export const CanonicalInputVersionSchema = z
  .string()
  .regex(
    /^sha256:[a-f0-9]{64}$/,
    "Canonical Input Version must be sha256:<64 lower hex>.",
  )
  .transform((value): CanonicalInputVersion => value as CanonicalInputVersion);

export type RecallDerivationVersion = string & {
  readonly [recallDerivationVersion]: "RecallDerivationVersion";
};

export const RecallDerivationVersionSchema = z
  .string()
  .regex(
    /^sha256:[a-f0-9]{64}$/,
    "Recall Derivation Version must be sha256:<64 lower hex>.",
  )
  .transform(
    (value): RecallDerivationVersion => value as RecallDerivationVersion,
  );

export const RecallDerivationVersionInputSchema = z.strictObject({
  contract: z.string().min(1),
  languageAnalysisVersion: LanguageAnalysisVersionSchema,
  tokenizerPipeline: z.array(
    z.strictObject({
      reference: ServiceImplementationReferenceSchema.refine(
        (reference) => reference.serviceType === "TOKENIZER",
        "Recall Derivation tokenizer entries must reference TOKENIZER services.",
      ),
      packageName: z.string().min(1),
      packageVersion: z.string().min(1),
      priority: z.number(),
      tieBreak: z.string().min(1),
      semanticConfig: z.json(),
      configurationDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }),
  ),
  normalization: z.record(z.string(), z.json()),
  rules: z.record(z.string(), z.json()),
});

export type RecallDerivationVersionInput = z.input<
  typeof RecallDerivationVersionInputSchema
>;

export type RecallDerivationTokenizerPipelineEntry = z.infer<
  typeof RecallDerivationVersionInputSchema.shape.tokenizerPipeline.element
>;

export const compareRecallDerivationTokenizerPipelineEntries = (
  left: Pick<RecallDerivationTokenizerPipelineEntry, "priority" | "tieBreak">,
  right: Pick<RecallDerivationTokenizerPipelineEntry, "priority" | "tieBreak">,
): number =>
  right.priority - left.priority ||
  compareCodeUnitStrings(left.tieBreak, right.tieBreak);

export const computeRecallDerivationVersion = async (
  input: RecallDerivationVersionInput,
): Promise<RecallDerivationVersion> => {
  const verified = RecallDerivationVersionInputSchema.parse(input);
  const content = new TextEncoder().encode(
    stableSerializeLanguageAnalysis(verified),
  );
  const digest = await crypto.subtle.digest("SHA-256", content);
  return RecallDerivationVersionSchema.parse(
    `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
};

export const RecallDerivationTargetIdSchema = z.string().regex(/^[1-9]\d*$/);

const RecallDerivationReferenceFields = {
  targetId: RecallDerivationTargetIdSchema,
  languageId: NormalizedLanguageIdSchema,
  demandRevision: z.int().positive(),
};

export const MemoryItemRecallDerivationReferenceSchema = z.strictObject({
  targetKind: z.literal("MEMORY_ITEM"),
  ...RecallDerivationReferenceFields,
});

export const TermConceptRecallDerivationReferenceSchema = z.strictObject({
  targetKind: z.literal("TERM_CONCEPT"),
  ...RecallDerivationReferenceFields,
});

export const RecallDerivationReferenceSchema = z.discriminatedUnion(
  "targetKind",
  [
    MemoryItemRecallDerivationReferenceSchema,
    TermConceptRecallDerivationReferenceSchema,
  ],
);

export type RecallDerivationReference = z.infer<
  typeof RecallDerivationReferenceSchema
>;

export const RecallDerivationBlockerSchema = z.discriminatedUnion("reason", [
  z.strictObject({
    reason: z.literal("LANGUAGE_ANALYSIS"),
    retryable: z.boolean(),
    message: z.string().min(1),
  }),
  z.strictObject({
    reason: z.literal("TOKENIZER"),
    retryable: z.boolean(),
    message: z.string().min(1),
  }),
  z.strictObject({
    reason: z.literal("DERIVATION_EXECUTION"),
    retryable: z.boolean(),
    message: z.string().min(1),
  }),
]);

export type RecallDerivationBlocker = z.infer<
  typeof RecallDerivationBlockerSchema
>;

export type RecallDerivationBlockerLifecycle = "PENDING" | "BLOCKED" | "FAILED";

export const classifyRecallDerivationBlocker = (
  blocker: RecallDerivationBlocker,
): RecallDerivationBlockerLifecycle => {
  if (blocker.retryable) return "PENDING";
  if (
    blocker.reason === "LANGUAGE_ANALYSIS" ||
    blocker.reason === "TOKENIZER"
  ) {
    return "BLOCKED";
  }
  return "FAILED";
};

export const computeCanonicalInputVersion = async (
  value: unknown,
): Promise<CanonicalInputVersion> => {
  const content = new TextEncoder().encode(
    stableSerializeLanguageAnalysis(value),
  );
  const digest = await crypto.subtle.digest("SHA-256", content);
  return CanonicalInputVersionSchema.parse(
    `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")}`,
  );
};
