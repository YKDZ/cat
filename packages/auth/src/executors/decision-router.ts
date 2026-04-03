import type { AuthNodeExecutor } from "../types.ts";

/**
 * decision_router — a no-op executor node that simply lets the scheduler
 * evaluate outgoing edge conditions.
 * The `resolveNextNode` logic in the scheduler handles all routing.
 */
export const decisionRouterExecutor: AuthNodeExecutor = async (
  _ctx,
  _nodeDef,
) => {
  return {
    updates: {},
    status: "advance",
  };
};
