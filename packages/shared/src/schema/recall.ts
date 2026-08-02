import * as z from "zod";

import { EvidenceLaneSchema } from "#/schema/precision-recall.ts";
import {
  CanonicalInputVersionSchema,
  RecallDerivationReferenceSchema,
  RecallDerivationVersionSchema,
} from "#/schema/recall-derivation.ts";

export const CandidateChannelValues = [
  "EXACT",
  "FUZZY",
  "KEYWORD",
  "VARIANT",
  "SEMANTIC",
] as const;
export const CandidateChannelSchema = z.enum(CandidateChannelValues);
export type CandidateChannel = z.infer<typeof CandidateChannelSchema>;

export const CandidateChannelRequestSchema = z
  .array(CandidateChannelSchema)
  .min(1)
  .superRefine((channels, context) => {
    if (new Set(channels).size !== channels.length) {
      context.addIssue({
        code: "custom",
        message: "Candidate Channels must be unique.",
      });
    }
  });
export type CandidateChannelRequest = z.infer<
  typeof CandidateChannelRequestSchema
>;

export const CandidateChannelOutcomeStatusValues = [
  "SUCCEEDED",
  "EMPTY",
  "BLOCKED",
  "SKIPPED",
] as const;
export const CandidateChannelOutcomeStatusSchema = z.enum(
  CandidateChannelOutcomeStatusValues,
);
export type CandidateChannelOutcomeStatus = z.infer<
  typeof CandidateChannelOutcomeStatusSchema
>;

export const CandidateChannelBlockerReasonValues = [
  "LANGUAGE_ANALYSIS_UNAVAILABLE",
  "RECALL_DERIVATION_PENDING",
  "RECALL_DERIVATION_BLOCKED",
  "RECALL_DERIVATION_FAILED",
  "RECALL_DERIVATION_STALE",
  "CAPABILITY_UNAVAILABLE",
  "CHANNEL_EXECUTION_FAILED",
] as const;
export const CandidateChannelBlockerReasonSchema = z.enum(
  CandidateChannelBlockerReasonValues,
);

export const CandidateChannelCapabilityValues = [
  "LANGUAGE_ANALYSIS",
  "RECALL_DERIVATION",
  "TEXT_VECTORIZER",
  "VECTOR_STORAGE",
  "DATABASE",
] as const;
export const CandidateChannelCapabilitySchema = z.enum(
  CandidateChannelCapabilityValues,
);
export type CandidateChannelCapability = z.infer<
  typeof CandidateChannelCapabilitySchema
>;

const CandidateChannelBlockerFields = {
  message: z.string().min(1),
  retryable: z.boolean(),
};
export const RecallDerivationAffectedTargetSchema = z.discriminatedUnion(
  "targetKind",
  [
    z.strictObject({
      targetKind: z.literal("MEMORY_ITEM"),
      targetId: z.string().regex(/^[1-9]\d*$/),
      languageId: z.string().min(1),
    }),
    z.strictObject({
      targetKind: z.literal("TERM_CONCEPT"),
      targetId: z.string().regex(/^[1-9]\d*$/),
      languageId: z.string().min(1),
    }),
  ],
);
export type RecallDerivationAffectedTarget = z.infer<
  typeof RecallDerivationAffectedTargetSchema
>;
const RecallDerivationBlockerFields = {
  ...CandidateChannelBlockerFields,
  capability: z.literal("RECALL_DERIVATION"),
  affectedTargets: z.array(RecallDerivationAffectedTargetSchema).min(1),
  affectedReferences: z
    .array(RecallDerivationReferenceSchema)
    .min(1)
    .optional(),
  requiredDerivationVersion: RecallDerivationVersionSchema,
};

export const CandidateChannelBlockerSchema = z.discriminatedUnion("reason", [
  z.strictObject({
    reason: z.literal("LANGUAGE_ANALYSIS_UNAVAILABLE"),
    ...CandidateChannelBlockerFields,
    capability: z.literal("LANGUAGE_ANALYSIS"),
  }),
  z.strictObject({
    reason: z.literal("RECALL_DERIVATION_PENDING"),
    ...RecallDerivationBlockerFields,
    currentDerivationVersion:
      RecallDerivationVersionSchema.nullable().optional(),
  }),
  z.strictObject({
    reason: z.literal("RECALL_DERIVATION_BLOCKED"),
    ...RecallDerivationBlockerFields,
    currentDerivationVersion:
      RecallDerivationVersionSchema.nullable().optional(),
  }),
  z.strictObject({
    reason: z.literal("RECALL_DERIVATION_FAILED"),
    ...RecallDerivationBlockerFields,
    currentDerivationVersion:
      RecallDerivationVersionSchema.nullable().optional(),
  }),
  z.strictObject({
    reason: z.literal("RECALL_DERIVATION_STALE"),
    ...RecallDerivationBlockerFields,
    requiredCanonicalInputVersion: CanonicalInputVersionSchema,
    currentCanonicalInputVersion: CanonicalInputVersionSchema.nullable(),
    currentDerivationVersion: RecallDerivationVersionSchema.nullable(),
  }),
  z.strictObject({
    reason: z.literal("CAPABILITY_UNAVAILABLE"),
    ...CandidateChannelBlockerFields,
    capability: CandidateChannelCapabilitySchema,
  }),
  z.strictObject({
    reason: z.literal("CHANNEL_EXECUTION_FAILED"),
    ...CandidateChannelBlockerFields,
    capability: CandidateChannelCapabilitySchema,
    affectedReferences: z.array(RecallDerivationReferenceSchema).optional(),
  }),
]);
export type CandidateChannelBlocker = z.infer<
  typeof CandidateChannelBlockerSchema
>;

export const CandidateChannelSkipReasonValues = [
  "NOT_REQUESTED",
  "NOT_APPLICABLE",
  "NO_SCOPED_ASSETS",
] as const;
export const CandidateChannelSkipReasonSchema = z.enum(
  CandidateChannelSkipReasonValues,
);
export type CandidateChannelSkipReason = z.infer<
  typeof CandidateChannelSkipReasonSchema
>;

export const RecallEvidenceSchema = z.object({
  channel: EvidenceLaneSchema,
  matchedText: z.string().optional(),
  matchedVariantText: z.string().optional(),
  matchedVariantType: z.string().optional(),
  confidence: z.number().min(0).max(1),
  note: z.string().optional(),
});

export type RecallEvidence = z.infer<typeof RecallEvidenceSchema>;

export type EvidencedRecallCandidate<TCandidate> = TCandidate & {
  evidences: [RecallEvidence, ...RecallEvidence[]];
};
export type NonEmptyRecallCandidates<TCandidate> = [
  EvidencedRecallCandidate<TCandidate>,
  ...EvidencedRecallCandidate<TCandidate>[],
];

export type CandidateChannelOutcome<TCandidate> =
  | { status: "SUCCEEDED"; candidates: NonEmptyRecallCandidates<TCandidate> }
  | { status: "EMPTY" }
  | { status: "BLOCKED"; blocker: CandidateChannelBlocker }
  | { status: "SKIPPED"; reason: CandidateChannelSkipReason };

export type CandidateChannelOutcomes<TCandidate> = Record<
  CandidateChannel,
  CandidateChannelOutcome<TCandidate>
>;

export type CandidateRecallResult<TCandidate> = {
  requestedChannels: CandidateChannelRequest;
  outcomes: CandidateChannelOutcomes<TCandidate>;
};

const withRecallEvidence = <
  TShape extends z.core.$ZodShape,
  TConfig extends z.core.$ZodObjectConfig,
>(
  candidateSchema: z.ZodObject<TShape, TConfig>,
) =>
  candidateSchema.extend({
    evidences: z.tuple([RecallEvidenceSchema], RecallEvidenceSchema),
  });

export const createCandidateChannelOutcomeSchema = <
  TShape extends z.core.$ZodShape,
  TConfig extends z.core.$ZodObjectConfig,
>(
  candidateSchema: z.ZodObject<TShape, TConfig>,
) => {
  const evidencedCandidateSchema = withRecallEvidence(candidateSchema);
  return z.discriminatedUnion("status", [
    z.strictObject({
      status: z.literal("SUCCEEDED"),
      candidates: z.tuple([evidencedCandidateSchema], evidencedCandidateSchema),
    }),
    z.strictObject({ status: z.literal("EMPTY") }),
    z.strictObject({
      status: z.literal("BLOCKED"),
      blocker: CandidateChannelBlockerSchema,
    }),
    z.strictObject({
      status: z.literal("SKIPPED"),
      reason: CandidateChannelSkipReasonSchema,
    }),
  ]);
};

export const createCandidateRecallResultSchema = <
  TShape extends z.core.$ZodShape,
  TConfig extends z.core.$ZodObjectConfig,
>(
  candidateSchema: z.ZodObject<TShape, TConfig>,
) => {
  return z
    .strictObject({
      requestedChannels: CandidateChannelRequestSchema,
      outcomes: z.strictObject({
        EXACT: createCandidateChannelOutcomeSchema(candidateSchema),
        FUZZY: createCandidateChannelOutcomeSchema(candidateSchema),
        KEYWORD: createCandidateChannelOutcomeSchema(candidateSchema),
        VARIANT: createCandidateChannelOutcomeSchema(candidateSchema),
        SEMANTIC: createCandidateChannelOutcomeSchema(candidateSchema),
      }),
    })
    .superRefine((result, context) => {
      const requested = new Set(result.requestedChannels);
      for (const channel of CandidateChannelValues) {
        const outcome = result.outcomes[channel];
        if (requested.has(channel)) {
          if (
            outcome.status === "SKIPPED" &&
            outcome.reason === "NOT_REQUESTED"
          ) {
            context.addIssue({
              code: "custom",
              path: ["outcomes", channel],
              message: `Requested Candidate Channel ${channel} cannot be NOT_REQUESTED.`,
            });
          }
          continue;
        }
        if (
          outcome.status !== "SKIPPED" ||
          outcome.reason !== "NOT_REQUESTED"
        ) {
          context.addIssue({
            code: "custom",
            path: ["outcomes", channel],
            message: `Unrequested Candidate Channel ${channel} must be NOT_REQUESTED.`,
          });
        }
      }
    });
};

export const createCandidateStreamEventSchema = <
  TShape extends z.core.$ZodShape,
  TConfig extends z.core.$ZodObjectConfig,
  TResult extends z.ZodType,
>(
  candidateSchema: z.ZodObject<TShape, TConfig>,
  resultSchema: TResult,
) =>
  z.discriminatedUnion("type", [
    z.strictObject({
      type: z.literal("CANDIDATE"),
      candidate: withRecallEvidence(candidateSchema),
    }),
    z.strictObject({
      type: z.literal("COMPLETED"),
      result: resultSchema,
    }),
  ]);

export const createCandidateRecallStreamEventSchema = <
  TShape extends z.core.$ZodShape,
  TConfig extends z.core.$ZodObjectConfig,
>(
  candidateSchema: z.ZodObject<TShape, TConfig>,
) =>
  createCandidateStreamEventSchema(
    candidateSchema,
    createCandidateRecallResultSchema(candidateSchema),
  );

export const RecallDebugContextSchema = z.object({
  queryText: z.string().optional(),
  sourceLanguageId: z.string().optional(),
  channelsAttempted: z.array(CandidateChannelSchema).optional(),
  rerankNotes: z.array(z.string()).optional(),
});

export type RecallDebugContext = z.infer<typeof RecallDebugContextSchema>;
