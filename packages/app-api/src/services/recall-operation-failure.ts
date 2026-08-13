import { createOperationFailure, executeCommand } from "@cat/domain";
import { RecallOperationFailureError } from "@cat/operations";
import type { TaskAffectedResource } from "@cat/shared";
import { ORPCError } from "@orpc/client";

import type { Context } from "#/utils/context.ts";

/** Persists a classified candidate-recall failure at an authenticated API boundary. */
export const throwRecallOperationFailure = async (input: {
  context: Context;
  error: unknown;
  affectedResources: TaskAffectedResource[];
}): Promise<never> => {
  if (!(input.error instanceof RecallOperationFailureError)) {
    throw input.error;
  }

  const operationFailure = await executeCommand(
    { db: input.context.drizzleDB.client },
    createOperationFailure,
    {
      failure: {
        ...input.error.failure,
        affectedResources: input.affectedResources,
      },
    },
  );
  throw new ORPCError("PRECONDITION_FAILED", {
    message: operationFailure.message,
    data: {
      operationFailure: { id: operationFailure.id },
    },
  });
};
