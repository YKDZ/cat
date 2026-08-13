import { createOperationFailure, executeCommand } from "@cat/domain";
import { mapLanguageAnalysisOperationFailure } from "@cat/operations";
import type { TaskAffectedResource } from "@cat/shared";
import { ORPCError } from "@orpc/client";

import type { Context } from "#/utils/context.ts";

/** Persists a classified language-analysis failure at an authenticated API boundary. */
export const throwLanguageAnalysisOperationFailure = async (input: {
  context: Context;
  error: unknown;
  affectedResources: TaskAffectedResource[];
}): Promise<never> => {
  const failure = mapLanguageAnalysisOperationFailure(
    input.error,
    input.affectedResources,
  );
  if (failure === undefined) throw input.error;

  const operationFailure = await executeCommand(
    { db: input.context.drizzleDB.client },
    createOperationFailure,
    { failure },
  );
  throw new ORPCError("PRECONDITION_FAILED", {
    message: operationFailure.message,
    data: {
      operationFailure: { id: operationFailure.id },
    },
  });
};
