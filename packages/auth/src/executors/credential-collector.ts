import type { AuthNodeExecutor } from "../types.ts";

/**
 * credential_collector — collect identifier/username input from user.
 * Stores provided input into `nodeOutputs.<nodeId>` on the blackboard.
 */
export const credentialCollectorExecutor: AuthNodeExecutor = async (
  ctx,
  nodeDef,
) => {
  if (!ctx.input || Object.keys(ctx.input).length === 0) {
    return {
      updates: {},
      status: "wait_input",
      clientHint: nodeDef.clientHint,
    };
  }

  return {
    updates: {
      [`nodeOutputs.${nodeDef.id}`]: ctx.input,
    },
    status: "advance",
  };
};
