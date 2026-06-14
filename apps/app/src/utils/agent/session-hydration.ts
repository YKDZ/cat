import type { AgentSessionMetadata } from "@cat/shared";

import { AgentSessionMetadataSchema } from "@cat/shared";

import type {
  AgentMessageItem,
  AgentSessionContext,
  HydratedSessionState,
} from "@/stores/agent";

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const toDate = (value: unknown): Date => {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
};

const normalizeSessionContext = (
  metadata: unknown,
): AgentSessionContext | null => {
  const parsed = AgentSessionMetadataSchema.safeParse(metadata);
  if (!parsed.success) return null;
  return parsed.data satisfies AgentSessionMetadata;
};

/**
 * Extract a message list from a blackboard snapshot for direct frontend rendering.
 *
 * @param blackboard - Session blackboard snapshot
 * @returns - Filtered and normalized message list
 */
export const hydrateMessagesFromBlackboard = (
  blackboard: Record<string, unknown> | null,
): AgentMessageItem[] => {
  const rawMessages = Array.isArray(blackboard?.["messages"])
    ? blackboard["messages"]
    : [];

  return rawMessages.flatMap((message) => {
    if (!isRecord(message) || typeof message.role !== "string") return [];

    const role = message.role.toUpperCase();
    if (role === "TOOL" || role === "SYSTEM") return [];

    return [
      {
        role,
        content: typeof message.content === "string" ? message.content : null,
        toolCallId: null,
        stepIndex: null,
        thinkingText: null,
        steps: [],
        createdAt: toDate(message.createdAt),
      } satisfies AgentMessageItem,
    ];
  });
};

/**
 * Convert the session-state response into a store-ready hydration result.
 *
 * @param state - Session-state API payload
 * @returns - Normalized hydrated session state
 */
export const hydrateSessionState = (state: {
  sessionId: string;
  agentDefinitionId: string;
  status: string;
  metadata: unknown;
  runId: string | null;
  runStatus: string | null;
  blackboardSnapshot: unknown;
}): HydratedSessionState => {
  const blackboardSnapshot = isRecord(state.blackboardSnapshot)
    ? state.blackboardSnapshot
    : null;

  return {
    sessionId: state.sessionId,
    agentDefinitionId: state.agentDefinitionId,
    status: state.status,
    metadata: normalizeSessionContext(state.metadata),
    runId: state.runId,
    runStatus: state.runStatus,
    blackboardSnapshot,
    messages: hydrateMessagesFromBlackboard(blackboardSnapshot),
  };
};
