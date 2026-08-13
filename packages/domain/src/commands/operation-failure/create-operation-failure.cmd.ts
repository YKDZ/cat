import { randomUUID } from "node:crypto";

import { operationFailure } from "@cat/db";
import {
  type OperationFailure,
  OperationFailureInputSchema,
  OperationFailureSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Command } from "#/types.ts";

export const CreateOperationFailureCommandSchema = z.strictObject({
  id: z.uuidv4().optional(),
  failure: OperationFailureInputSchema,
  taskId: z.uuidv4().optional(),
  traceId: z.string().min(1).optional(),
});

export type CreateOperationFailureCommand = z.infer<
  typeof CreateOperationFailureCommandSchema
>;

export const toOperationFailure = (row: {
  id: string;
  code: OperationFailure["code"];
  message: string;
  severity: OperationFailure["severity"];
  retryable: boolean;
  blocker: OperationFailure["blocker"] | null;
  capability: OperationFailure["capability"] | null;
  authorizationDecision: OperationFailure["authorizationDecision"] | null;
  affectedResources: OperationFailure["affectedResources"];
  remediationHint: string | null;
  redactionBoundary: OperationFailure["redactionBoundary"];
  taskId: string | null;
  traceId: string | null;
}): OperationFailure =>
  OperationFailureSchema.parse({
    id: row.id,
    code: row.code,
    message: row.message,
    severity: row.severity,
    retryable: row.retryable,
    ...(row.blocker === null ? {} : { blocker: row.blocker }),
    ...(row.capability === null ? {} : { capability: row.capability }),
    ...(row.authorizationDecision === null
      ? {}
      : { authorizationDecision: row.authorizationDecision }),
    affectedResources: row.affectedResources,
    ...(row.remediationHint === null
      ? {}
      : { remediationHint: row.remediationHint }),
    redactionBoundary: row.redactionBoundary,
    ...(row.taskId === null ? {} : { taskId: row.taskId }),
    ...(row.traceId === null ? {} : { traceId: row.traceId }),
  });

export const createOperationFailure: Command<
  CreateOperationFailureCommand,
  OperationFailure
> = async (ctx, command) => {
  const id = command.id ?? randomUUID();
  const [row] = await ctx.db
    .insert(operationFailure)
    .values({
      id,
      ...command.failure,
      taskId: command.taskId,
      traceId: command.traceId,
    })
    .returning();

  if (row === undefined) {
    throw new Error("Operation failure creation did not return a row.");
  }

  return { result: toOperationFailure(row), events: [] };
};
