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
 * @zh 从黑板快照中提取可供前端直接渲染的消息列表。
 * @en Extract a message list from a blackboard snapshot for direct frontend rendering.
 *
 * @param blackboard - {@zh 会话黑板快照} {@en Session blackboard snapshot}
 * @returns - {@zh 过滤并标准化后的消息列表} {@en Filtered and normalized message list}
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
 * @zh 将会话状态接口返回值转换为 store 可直接消费的 hydration 结果。
 * @en Convert the session-state response into a store-ready hydration result.
 *
 * @param state - {@zh 会话状态接口返回值} {@en Session-state API payload}
 * @returns - {@zh 归一化后的会话 hydration 状态} {@en Normalized hydrated session state}
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
