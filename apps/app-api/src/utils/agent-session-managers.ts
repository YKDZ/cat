import type { ToolConfirmResponse } from "@cat/shared/schema/agent";
import type { ToolExecuteResponse } from "@cat/shared/schema/agent";

import { PendingCallManager } from "./pending-call-manager.ts";

/**
 * Per-session pending call managers for agent tool confirmation
 * and client-side tool execution.
 *
 * Each session gets its own pair of managers, which are lazily created
 * and cleaned up when the session ends.
 */

type SessionManagers = {
  confirmations: PendingCallManager<ToolConfirmResponse>;
  executions: PendingCallManager<ToolExecuteResponse>;
};

const sessions = new Map<string, SessionManagers>();

export const getSessionManagers = (sessionId: string): SessionManagers => {
  let managers = sessions.get(sessionId);
  if (!managers) {
    managers = {
      confirmations: new PendingCallManager<ToolConfirmResponse>(),
      executions: new PendingCallManager<ToolExecuteResponse>(),
    };
    sessions.set(sessionId, managers);
  }
  return managers;
};

export const clearSessionManagers = (sessionId: string): void => {
  const managers = sessions.get(sessionId);
  if (managers) {
    managers.confirmations.clear();
    managers.executions.clear();
    sessions.delete(sessionId);
  }
};
