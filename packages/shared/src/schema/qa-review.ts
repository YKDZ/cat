import * as z from "zod";

import {
  QaFindingActionSchema,
  QaFindingDispositionSchema,
  QaReviewAnnotationIntentSchema,
  QaReviewDecisionTypeSchema,
  QaReviewNotificationTypeSchema,
  QaReviewQueueStatusSchema,
  QaReviewRiskBucketSchema,
  QaReviewRunLayerSchema,
  QaReviewSuggestionStatusSchema,
} from "@/schema/enum.ts";
import { safeZDotJson } from "@/schema/json.ts";

export const QaReviewTextRangeSchema = z
  .object({
    start: z.int().min(0),
    end: z.int().min(0),
  })
  .refine((range) => range.end >= range.start, {
    message: "end must be greater than or equal to start",
  });
export type QaReviewTextRange = z.infer<typeof QaReviewTextRangeSchema>;

export const QaReviewSpanSchema = z.object({
  tokenIndex: z.int().min(0).optional(),
  textRange: QaReviewTextRangeSchema.optional(),
  quote: z.string().optional(),
});
export type QaReviewSpan = z.infer<typeof QaReviewSpanSchema>;

export const QaReviewRuleSchema = z.object({
  checkerId: z.string().optional(),
  ruleId: z.string().optional(),
  ruleFamily: z.string().optional(),
  action: QaFindingActionSchema,
  minConfidenceBasisPoints: z.int().min(0).max(10000).default(0),
  riskScore: z.int().min(0).max(100).default(50),
});
export type QaReviewRule = z.infer<typeof QaReviewRuleSchema>;

export const QaReviewProfileConfigSchema = z.object({
  enabledLayers: z
    .object({
      deterministic: z.literal(true).default(true),
      semantic: z.boolean(),
    })
    .default({ deterministic: true, semantic: false }),
  rules: z.array(QaReviewRuleSchema).default([]),
  llm: z
    .object({
      providerServiceId: z.int().positive().optional(),
      maxTokens: z.int().positive().default(1200),
      temperature: z.number().min(0).max(2).default(0),
      minRiskScoreForQueue: z.int().min(0).max(100).default(40),
    })
    .default({ maxTokens: 1200, temperature: 0, minRiskScoreForQueue: 40 }),
});
export type QaReviewProfileConfig = z.infer<typeof QaReviewProfileConfigSchema>;

export const NormalizedQaFindingSchema = z.object({
  layer: QaReviewRunLayerSchema,
  checkerServiceId: z.int().nullable().optional(),
  qaResultItemId: z.int().nullable().optional(),
  ruleId: z.string(),
  ruleFamily: z.string(),
  severity: z.enum(["error", "warning", "info"]),
  action: QaFindingActionSchema,
  disposition: QaFindingDispositionSchema.default("OPEN"),
  confidenceBasisPoints: z.int().min(0).max(10000),
  riskScore: z.int().min(0).max(100),
  message: z.string(),
  explanation: z.string().nullable().default(null),
  sourceSpan: QaReviewSpanSchema.nullable().default(null),
  targetSpan: QaReviewSpanSchema.nullable().default(null),
  suggestedText: z.string().nullable().default(null),
  meta: safeZDotJson.nullable().default(null),
});
export type NormalizedQaFinding = z.infer<typeof NormalizedQaFindingSchema>;

export const QaReviewNotificationDataSchema = z.object({
  reviewEventType: QaReviewNotificationTypeSchema,
  projectId: z.uuidv4(),
  queueItemId: z.int().positive().optional(),
  annotationId: z.int().positive().optional(),
  suggestionId: z.int().positive().optional(),
  decisionId: z.int().positive().optional(),
  elementId: z.int().positive().optional(),
  translationId: z.int().positive().optional(),
  branchId: z.int().positive().optional(),
  pullRequestId: z.int().positive().optional(),
});
export type QaReviewNotificationData = z.infer<
  typeof QaReviewNotificationDataSchema
>;

export const QaReviewQueueFiltersSchema = z.object({
  queueStatus: z.array(QaReviewQueueStatusSchema).default([]),
  riskBucket: z.array(QaReviewRiskBucketSchema).default([]),
  claimedBy: z.uuidv4().optional(),
  findingAction: z.array(QaFindingActionSchema).default([]),
  includeResolved: z.boolean().default(false),
});
export type QaReviewQueueFilters = z.infer<typeof QaReviewQueueFiltersSchema>;

export const SubmitQaReviewDecisionInputSchema = z.object({
  queueItemId: z.int().positive(),
  decision: QaReviewDecisionTypeSchema,
  reason: z.string().trim().min(1).max(4000),
  findingId: z.int().positive().optional(),
  findingDisposition: z
    .enum(["FALSE_POSITIVE", "ACCEPTED", "SUPPRESSED"])
    .optional(),
  annotationId: z.int().positive().optional(),
  expectedVersion: z.int().positive(),
  overrideBlocking: z.boolean().default(false),
});
export type SubmitQaReviewDecisionInput = z.infer<
  typeof SubmitQaReviewDecisionInputSchema
>;

/**
 * Action types for the QA review workbench.
 */
export const QaReviewWorkbenchActionSchema = z.enum([
  "APPROVE",
  "REJECT_CANDIDATE",
  "DEFER",
]);

/**
 * Action types for the QA review workbench.
 */
export type QaReviewWorkbenchAction = z.infer<
  typeof QaReviewWorkbenchActionSchema
>;

/**
 * Input payload for submitting a QA workbench action.
 */
export const SubmitQaReviewActionInputSchema = z
  .object({
    projectId: z.uuidv4(),
    languageId: z.string().min(1),
    branchId: z.int().positive().nullable().optional(),
    elementId: z.int().positive(),
    translationId: z.int().positive(),
    queueItemId: z.int().positive(),
    action: QaReviewWorkbenchActionSchema,
    expectedVersion: z.int().positive(),
    noteBody: z.string().trim().max(10000).optional(),
    overrideBlocking: z.boolean().default(false),
    overrideReason: z.string().trim().max(4000).optional(),
    navigation: z
      .object({
        afterElementId: z.int().positive().optional(),
        pageSize: z.int().positive().default(16),
      })
      .optional(),
  })
  .superRefine((input, ctx) => {
    if (
      input.action === "APPROVE" &&
      input.overrideBlocking &&
      !input.overrideReason?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["overrideReason"],
        message: "overrideReason is required when overriding blocking findings",
      });
    }
  });

/**
 * Input payload for submitting a QA workbench action.
 */
export type SubmitQaReviewActionInput = z.infer<
  typeof SubmitQaReviewActionInputSchema
>;

/**
 * Result payload for a QA workbench action.
 */
export const QaReviewActionResultSchema = z.object({
  decisionId: z.int().positive(),
  annotationId: z.int().positive().nullable(),
  queueItemId: z.int().positive(),
  queueStatus: QaReviewQueueStatusSchema,
  approvedTranslationId: z.int().positive().nullable(),
  affectedSiblingQueueItemIds: z.array(z.int().positive()),
  nextTarget: z.union([
    z.object({ kind: z.literal("element"), elementId: z.int().positive() }),
    z.object({ kind: z.literal("empty") }),
  ]),
});

/**
 * Result payload for a QA workbench action.
 */
export type QaReviewActionResult = z.infer<typeof QaReviewActionResultSchema>;

export const CreateQaReviewAnnotationInputSchema = z.object({
  queueItemId: z.int().positive(),
  findingId: z.int().positive().optional(),
  intent: QaReviewAnnotationIntentSchema,
  body: z.string().trim().min(1).max(10000),
  targetRange: QaReviewTextRangeSchema.optional(),
  quote: z.string().max(2000).optional(),
  parentAnnotationId: z.int().positive().optional(),
  isPromotable: z.boolean().default(false),
});
export type CreateQaReviewAnnotationInput = z.infer<
  typeof CreateQaReviewAnnotationInputSchema
>;

export const CreateQaReviewSuggestionInputSchema = z.object({
  annotationId: z.int().positive(),
  proposedText: z.string().min(1).max(20000),
  targetRange: QaReviewTextRangeSchema.optional(),
});
export type CreateQaReviewSuggestionInput = z.infer<
  typeof CreateQaReviewSuggestionInputSchema
>;

export const ApplyQaReviewSuggestionInputSchema = z.object({
  suggestionId: z.int().positive(),
  expectedStatus: QaReviewSuggestionStatusSchema.default("OPEN"),
});
export type ApplyQaReviewSuggestionInput = z.infer<
  typeof ApplyQaReviewSuggestionInputSchema
>;

export const QaReviewRunMetaSchema = z.object({
  profileId: z.int().positive().nullable().optional(),
  traceId: z.string().optional(),
  deterministicOnly: z.boolean().optional(),
  rawError: z.string().optional(),
});
export type QaReviewRunMeta = z.infer<typeof QaReviewRunMetaSchema>;
