import type { AuthNodeExecutor } from "../types.ts";

/**
 * session_finalizer — create a session for the authenticated user.
 * Marks the flow as completed and records the final AAL.
 *
 * Actual session creation (cookie, session store write) is performed by
 * the app-layer executor override via `ctx.services.sessionStore`.
 */
export const sessionFinalizerExecutor: AuthNodeExecutor = async (
  ctx,
  _nodeDef,
) => {
  if (!ctx.blackboard.identity.userId) {
    return {
      updates: {},
      status: "failed",
      error: {
        code: "USER_NOT_RESOLVED",
        message: "Cannot finalize session: userId not set on blackboard",
      },
    };
  }

  return {
    updates: {
      status: "completed",
    },
    status: "completed",
  };
};
