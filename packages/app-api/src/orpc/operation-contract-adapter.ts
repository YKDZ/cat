import { ORPCError } from "@orpc/client";

import {
  OperationContractError,
  type OperationInvocationContext,
} from "#/operation-contracts/index.ts";
import type { Context } from "#/utils/context.ts";

export const operationInvocationContextFromORPC = (
  context: Context,
): OperationInvocationContext => {
  if (context.user === null || context.auth === null) {
    throw new ORPCError("UNAUTHORIZED", {
      message: "Authenticated operation context is required",
    });
  }

  return {
    db: context.drizzleDB.client,
    actor: {
      type: "user",
      id: context.user.id,
    },
    auth: context.auth,
    pluginManager: context.pluginManager,
    ...(context.requestSignal === undefined
      ? {}
      : { signal: context.requestSignal }),
  };
};

export const projectOperationContractErrorToORPC = (error: unknown): never => {
  if (error instanceof OperationContractError) {
    const code =
      error.identifier === "invalid_input"
        ? "BAD_REQUEST"
        : error.identifier === "permission_denied" ||
            error.identifier === "relationship_denied" ||
            error.identifier === "execution_denied"
          ? "FORBIDDEN"
          : error.identifier === "not_found"
            ? "NOT_FOUND"
            : "INTERNAL_SERVER_ERROR";

    throw new ORPCError(code, {
      message: error.message,
      data: {
        operationContractErrorIdentifier: error.identifier,
        operationFailure: error.operationFailure,
      },
    });
  }

  throw error;
};
