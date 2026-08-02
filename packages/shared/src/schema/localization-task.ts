import * as z from "zod";

import { OperationScopeSchema } from "#/schema/editor.ts";
import {
  BatchAutoTranslationTaskPhaseSchema,
  OperationFailureBlockerSchema,
  OperationFailureAuthorizationDecisionSchema,
  OperationFailureCapabilitySchema,
  OperationFailureCodeSchema,
  OperationFailureRedactionBoundarySchema,
  OperationFailureSeveritySchema,
  TaskAffectedResourceTypeSchema,
  TaskKindNameSchema,
  TaskStatusSchema,
} from "#/schema/enum.ts";
import { NormalizedLanguageIdSchema } from "#/schema/language-analysis.ts";
import { ServiceImplementationReferenceSchema } from "#/schema/service-implementation-reference.ts";

export const TaskAffectedResourceSchema = z.strictObject({
  type: TaskAffectedResourceTypeSchema,
  id: z.string().min(1),
});

export const TaskActorSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("USER"), id: z.uuidv4() }),
  z.strictObject({ type: z.literal("SYSTEM"), id: z.null() }),
]);

export const TaskScopeSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("PROJECT"), id: z.uuidv4() }),
  z.strictObject({ type: z.literal("USER"), id: z.uuidv4() }),
  z.strictObject({ type: z.literal("INSTANCE"), id: z.null() }),
]);

export const AutoTranslateConfigSchema = z.strictObject({
  llm: z
    .strictObject({
      enabled: z.boolean().default(false),
      llmProvider: ServiceImplementationReferenceSchema.optional(),
      systemPrompt: z.string().optional(),
      temperature: z.number().min(0).max(2).default(0.3),
      maxTokens: z.int().default(1024),
    })
    .optional(),
  gatherScopeContext: z.boolean().default(false),
  weights: z
    .strictObject({
      memory: z.number().min(0).default(1),
      advisor: z.number().min(0).default(0.8),
    })
    .optional(),
  highConfidenceThreshold: z.number().min(0).max(1).default(0.95),
});

export const MAX_BATCH_AUTO_TRANSLATION_SNAPSHOT_ELEMENTS = 10_000;

export const BatchAutoTranslationInvocationSchema = z.strictObject({
  ...OperationScopeSchema.omit({ elementIds: true, branchId: true }).shape,
  elementIds: z
    .array(z.int().positive())
    .max(MAX_BATCH_AUTO_TRANSLATION_SNAPSHOT_ELEMENTS),
  languageId: NormalizedLanguageIdSchema,
  advisor: ServiceImplementationReferenceSchema.optional(),
  minMemorySimilarity: z.number().min(0).max(1).default(0.72),
  maxMemoryAmount: z.int().min(0).default(3),
  memoryVectorStorage: ServiceImplementationReferenceSchema,
  translationVectorStorage: ServiceImplementationReferenceSchema,
  vectorizer: ServiceImplementationReferenceSchema,
  translatorId: z.uuidv4(),
  memoryIds: z.array(z.uuidv4()).default([]),
  glossaryIds: z.array(z.uuidv4()).default([]),
  config: AutoTranslateConfigSchema.optional(),
});

export const BatchAutoTranslationTaskPayloadSchema = z.strictObject({
  invocation: BatchAutoTranslationInvocationSchema,
  cancelable: z.literal(true),
});

export const TaskKindSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: TaskKindNameSchema.extract(["BATCH_AUTO_TRANSLATION"]),
    payload: BatchAutoTranslationTaskPayloadSchema,
  }),
]);

export const BatchAutoTranslationTaskResultSchema = z.strictObject({
  translationIds: z.array(z.int()),
  translatedElementIds: z.array(z.int()),
  skippedElementIds: z.array(z.int()),
});

export const TaskRuntimeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: TaskKindNameSchema.extract(["BATCH_AUTO_TRANSLATION"]),
    phase: BatchAutoTranslationTaskPhaseSchema.nullable(),
    result: BatchAutoTranslationTaskResultSchema.nullable(),
  }),
]);

export const OperationFailureSchema = z.strictObject({
  id: z.uuidv4(),
  code: OperationFailureCodeSchema,
  message: z.string().min(1),
  severity: OperationFailureSeveritySchema,
  retryable: z.boolean(),
  blocker: OperationFailureBlockerSchema.optional(),
  capability: OperationFailureCapabilitySchema.optional(),
  authorizationDecision: OperationFailureAuthorizationDecisionSchema.optional(),
  affectedResources: z.array(TaskAffectedResourceSchema),
  remediationHint: z.string().min(1).optional(),
  redactionBoundary: OperationFailureRedactionBoundarySchema,
  taskId: z.uuidv4().optional(),
  traceId: z.string().min(1).optional(),
});

export const OperationFailureInputSchema = OperationFailureSchema.omit({
  id: true,
  taskId: true,
  traceId: true,
});

export const TaskStateSchema = z.strictObject({
  status: TaskStatusSchema,
  scope: TaskScopeSchema,
  actor: TaskActorSchema,
  resources: z.array(TaskAffectedResourceSchema),
  revision: z.int().nonnegative(),
  progressCurrent: z.int().nonnegative().nullable(),
  progressTotal: z.int().positive().nullable(),
  runtime: TaskRuntimeSchema,
  currentFailureId: z.uuidv4().nullable(),
  retryOfTaskId: z.uuidv4().nullable(),
});

export type TaskAffectedResource = z.infer<typeof TaskAffectedResourceSchema>;
export type TaskActor = z.infer<typeof TaskActorSchema>;
export type TaskScope = z.infer<typeof TaskScopeSchema>;
export type TaskKind = z.infer<typeof TaskKindSchema>;
export type AutoTranslateConfig = z.infer<typeof AutoTranslateConfigSchema>;
export type BatchAutoTranslationInvocation = z.infer<
  typeof BatchAutoTranslationInvocationSchema
>;
export type BatchAutoTranslationTaskResult = z.infer<
  typeof BatchAutoTranslationTaskResultSchema
>;
export type OperationFailure = z.infer<typeof OperationFailureSchema>;
export type OperationFailureInput = z.infer<typeof OperationFailureInputSchema>;
export type TaskRuntime = z.infer<typeof TaskRuntimeSchema>;
export type TaskState = z.infer<typeof TaskStateSchema>;
