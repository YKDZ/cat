import { eq, task } from "@cat/db";
import {
  type JSONObject,
  JSONObjectSchema,
  TaskStatusSchema,
  type TaskStatus,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const LocalizationTaskActorSchema = z.object({
  type: z.literal("user"),
  id: z.uuidv4(),
});

export const LocalizationTaskAffectedResourceSchema = z.object({
  type: z.enum(["project", "translatable_element", "translation"]),
  id: z.string(),
});

export const LocalizationTaskRelatedReviewableChangeSchema = z.object({
  sourceOperation: z.string(),
  pullRequestId: z.int(),
});

export const LocalizationTaskRelatedPullRequestSchema = z.object({
  id: z.int(),
  number: z.int(),
});

export const OperationFailureAffectedResourceSchema = z.object({
  type: z.enum(["project", "translatable_element", "translation"]),
  id: z.string(),
});

export const OperationFailureSchema = z.object({
  id: z.uuidv4(),
  code: z.string(),
  message: z.string(),
  severity: z.enum(["info", "warning", "error"]),
  retryable: z.boolean(),
  affectedResources: z.array(OperationFailureAffectedResourceSchema),
  remediationHint: z.string(),
  taskId: z.uuidv4().optional(),
  traceId: z.string().optional(),
  redactionBoundary: z.enum(["public", "internal"]),
  missingCapability: z.enum(["VECTOR_STORAGE", "TEXT_VECTORIZER"]).optional(),
  authorizationDecision: z
    .enum(["api_key_scope_denied", "rebac_denied", "write_mode_denied"])
    .optional(),
  reviewBlocker: z
    .enum([
      "branch_translation_write_failed",
      "branch_write_context_unavailable",
      "reviewable_change_write_failed",
    ])
    .optional(),
});

export type OperationFailure = z.infer<typeof OperationFailureSchema>;

export const LocalizationTaskFailureSchema = z.object({
  identifier: z.string(),
  message: z.string(),
  operationFailure: OperationFailureSchema.optional(),
});

export const LocalizationTaskMetaSchema = z.object({
  operationContract: z.string(),
  actor: LocalizationTaskActorSchema,
  affectedResources: z.array(LocalizationTaskAffectedResourceSchema),
  relatedReviewableChange:
    LocalizationTaskRelatedReviewableChangeSchema.optional(),
  relatedPullRequest: LocalizationTaskRelatedPullRequestSchema.optional(),
  failure: LocalizationTaskFailureSchema.optional(),
});

export type LocalizationTaskMeta = z.infer<typeof LocalizationTaskMetaSchema>;

export type LocalizationTaskSummary = LocalizationTaskMeta & {
  id: string;
  status: TaskStatus;
};

export const UpsertLocalizationTaskCommandSchema = z.object({
  taskId: z.uuidv4().optional(),
  status: TaskStatusSchema,
  meta: LocalizationTaskMetaSchema,
});

export type UpsertLocalizationTaskCommand = z.infer<
  typeof UpsertLocalizationTaskCommandSchema
>;

const toTaskMetaJSON = (meta: LocalizationTaskMeta): JSONObject => {
  return JSONObjectSchema.parse(meta);
};

export const upsertLocalizationTask: Command<
  UpsertLocalizationTaskCommand,
  LocalizationTaskSummary
> = async (ctx, command) => {
  const values = {
    status: command.status,
    type: "localization.operation",
    meta: toTaskMetaJSON(command.meta),
    updatedAt: new Date(),
  };

  const [row] =
    command.taskId === undefined
      ? await ctx.db
          .insert(task)
          .values(values)
          .returning({ id: task.id, status: task.status, meta: task.meta })
      : await ctx.db
          .update(task)
          .set(values)
          .where(eq(task.id, command.taskId))
          .returning({ id: task.id, status: task.status, meta: task.meta });

  if (row === undefined) {
    throw new Error(`Localization task ${command.taskId} was not found`);
  }

  return {
    result: {
      id: row.id,
      status: row.status,
      ...LocalizationTaskMetaSchema.parse(row.meta),
    },
    events: [],
  };
};
