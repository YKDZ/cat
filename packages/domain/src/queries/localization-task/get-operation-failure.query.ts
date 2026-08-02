import {
  and,
  eq,
  inArray,
  isNull,
  operationFailure,
  or,
  sql,
  task,
} from "@cat/db";
import { OperationFailureSchema, type OperationFailure } from "@cat/shared";
import * as z from "zod";

import { toOperationFailure } from "#/commands/operation-failure/create-operation-failure.cmd.ts";
import type { Query } from "#/types.ts";

import { TaskReadAuthorizationSchema } from "./get-localization-task.query.ts";

export const OperationFailurePublicProjectionSchema =
  OperationFailureSchema.pick({
    id: true,
    code: true,
    message: true,
    severity: true,
    retryable: true,
    blocker: true,
    capability: true,
    authorizationDecision: true,
    affectedResources: true,
    remediationHint: true,
    redactionBoundary: true,
  })
    .extend({ redacted: z.literal(false) })
    .strip();
export type OperationFailurePublicProjection = z.infer<
  typeof OperationFailurePublicProjectionSchema
>;

export const OperationFailureRedactedProjectionSchema =
  OperationFailureSchema.pick({
    id: true,
    code: true,
    severity: true,
    retryable: true,
    blocker: true,
    redactionBoundary: true,
  })
    .extend({ redacted: z.literal(true) })
    .strip();
export type OperationFailureRedactedProjection = z.infer<
  typeof OperationFailureRedactedProjectionSchema
>;

export const GetOperationFailureQuerySchema = z.strictObject({
  id: z.uuidv4(),
  authorization: TaskReadAuthorizationSchema,
});

export type GetOperationFailureQuery = z.infer<
  typeof GetOperationFailureQuerySchema
>;

export const getOperationFailure: Query<
  GetOperationFailureQuery,
  | OperationFailure
  | OperationFailurePublicProjection
  | OperationFailureRedactedProjection
  | null
> = async (ctx, query) => {
  const { authorization } = query;
  const authorizedTaskScope = or(
    and(eq(task.scopeType, "USER"), eq(task.scopeId, authorization.viewerId)),
    ...(authorization.authorizedProjectIds.length === 0
      ? []
      : [
          and(
            eq(task.scopeType, "PROJECT"),
            inArray(task.scopeId, authorization.authorizedProjectIds),
          ),
        ]),
  );
  const authorizedStandaloneProjectFailure =
    authorization.authorizedProjectIds.length === 0
      ? sql`false`
      : and(
          isNull(operationFailure.taskId),
          // A standalone failure may be public only when every project
          // resource is in the caller's authorized set. One matching project
          // is insufficient because its message/resources can describe all.
          sql`EXISTS (
            SELECT 1
            FROM jsonb_array_elements(${operationFailure.affectedResources}) AS project_resource(value)
            WHERE project_resource.value ->> 'type' = 'PROJECT'
          )`,
          sql`NOT EXISTS (
            SELECT 1
            FROM jsonb_array_elements(${operationFailure.affectedResources}) AS project_resource(value)
            WHERE project_resource.value ->> 'type' = 'PROJECT'
              AND project_resource.value ->> 'id' NOT IN (${sql.join(
                authorization.authorizedProjectIds.map(
                  (projectId) => sql`${projectId}`,
                ),
                sql`, `,
              )})
          )`,
        );
  const [row] = await ctx.db
    .select({ failure: operationFailure })
    .from(operationFailure)
    .leftJoin(task, eq(operationFailure.taskId, task.id))
    .where(
      authorization.systemAdmin
        ? eq(operationFailure.id, query.id)
        : and(
            eq(operationFailure.id, query.id),
            or(authorizedTaskScope, authorizedStandaloneProjectFailure),
          ),
    );

  if (row === undefined) return null;

  const failure = toOperationFailure(row.failure);
  if (authorization.systemAdmin) return failure;
  if (failure.redactionBoundary === "PUBLIC") {
    return OperationFailurePublicProjectionSchema.parse({
      ...failure,
      redacted: false,
    });
  }
  return OperationFailureRedactedProjectionSchema.parse({
    ...failure,
    redacted: true,
  });
};
