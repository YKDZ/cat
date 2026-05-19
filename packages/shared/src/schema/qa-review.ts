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
