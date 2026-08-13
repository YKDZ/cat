import { and, eq, inArray, or, task } from "@cat/db";
import * as z from "zod";

import {
  taskFields,
  toSummary,
  type LocalizationTaskSummary,
} from "#/commands/localization-task/upsert-localization-task.cmd.ts";
import type { Query } from "#/types.ts";

export const TaskReadAuthorizationSchema = z.strictObject({
  viewerId: z.uuidv4(),
  authorizedProjectIds: z.array(z.uuidv4()),
  systemAdmin: z.boolean(),
});

export const GetLocalizationTaskQuerySchema = z.strictObject({
  taskId: z.uuidv4(),
  authorization: TaskReadAuthorizationSchema,
  requiredProjectId: z.uuidv4().optional(),
});

export type TaskReadAuthorization = z.infer<typeof TaskReadAuthorizationSchema>;
export type GetLocalizationTaskQuery = z.infer<
  typeof GetLocalizationTaskQuerySchema
>;

export const GetLocalizationTaskForWorkflowQuerySchema = z.strictObject({
  taskId: z.uuidv4(),
});

export type GetLocalizationTaskForWorkflowQuery = z.infer<
  typeof GetLocalizationTaskForWorkflowQuerySchema
>;

export const canReadTaskScope = (
  scope: { type: "PROJECT" | "USER" | "INSTANCE"; id: string | null },
  authorization: TaskReadAuthorization,
): boolean => {
  if (authorization.systemAdmin) return true;

  switch (scope.type) {
    case "PROJECT":
      return (
        scope.id !== null &&
        authorization.authorizedProjectIds.includes(scope.id)
      );
    case "USER":
      return scope.id === authorization.viewerId;
    case "INSTANCE":
      return false;
    default:
      throw new Error("Unsupported task scope.");
  }
};

export const getLocalizationTask: Query<
  GetLocalizationTaskQuery,
  LocalizationTaskSummary | null
> = async (ctx, query) => {
  const { authorization } = query;
  const accessCondition = authorization.systemAdmin
    ? undefined
    : or(
        and(
          eq(task.scopeType, "USER"),
          eq(task.scopeId, authorization.viewerId),
        ),
        ...(authorization.authorizedProjectIds.length === 0
          ? []
          : [
              and(
                eq(task.scopeType, "PROJECT"),
                inArray(task.scopeId, authorization.authorizedProjectIds),
              ),
            ]),
      );
  const [row] = await ctx.db
    .select(taskFields)
    .from(task)
    .where(
      and(
        eq(task.id, query.taskId),
        ...(query.requiredProjectId === undefined
          ? []
          : [
              and(
                eq(task.scopeType, "PROJECT"),
                eq(task.scopeId, query.requiredProjectId),
              ),
            ]),
        ...(authorization.systemAdmin ? [] : [accessCondition]),
      ),
    );

  return row === undefined ? null : toSummary(row);
};

/** Internal workflow read used only to refresh an optimistic task projection. */
export const getLocalizationTaskForWorkflow: Query<
  GetLocalizationTaskForWorkflowQuery,
  LocalizationTaskSummary | null
> = async (ctx, query) => {
  const [row] = await ctx.db
    .select(taskFields)
    .from(task)
    .where(eq(task.id, query.taskId));
  return row === undefined ? null : toSummary(row);
};
