import type { ToolConfirmResponse } from "@cat/shared/schema/agent";
import type { AgentDefinitionType, ScopeType } from "@cat/shared/schema/enum";

import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import type { GraphEvent, NodeExecution } from "@/app/types/agent-graph";

import { orpc } from "@/app/rpc/orpc";
import { clientLogger as logger } from "@/app/utils/logger";

// ─── Constants ───

// ─── Types ───

export interface AgentDefinitionSummary {
  id: string;
  name: string;
  description: string;
  scopeType: ScopeType;
  scopeId: string;
  isBuiltin: boolean;
}

export interface AgentSessionSummary {
  id: string;
  status: string;
  metadata: unknown;
  createdAt: Date;
}

export interface AgentMessageItem {
  role: string;
  content: string | null;
  toolCallId: string | null;
  stepIndex: number | null;
  thinkingText: string | null;
  steps: AgentStepItem[];
  createdAt: Date;
}

export interface AgentToolCallItem {
  id: string;
  nodeId?: string;
  toolName: string;
  arguments: Record<string, unknown>;
  result: unknown;
  error: string | null;
  durationMs: number | null;
  target?: "server" | "client";
  confirmationStatus?: string | null;
}

export interface AgentStepItem {
  index: number;
  thought: string | null;
  thinkingText: string | null;
  toolCalls: AgentToolCallItem[];
  /** `true` when this step terminated the agent loop (finish tool / implicit completion). */
  isFinish?: boolean;
}

/** Represents a pending tool confirmation the user needs to respond to. */
export interface PendingToolConfirmation {
  callId: string;
  nodeId?: string;
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high";
}

export type StreamingStatus =
  | "idle"
  | "streaming"
  | "paused"
  | "waiting_input"
  | "error"
  | "done";

export interface AgentDAGNodeEvent {
  nodeType: "precheck" | "reasoning" | "tool" | "decision";
  nodeId: string;
  status: "started" | "completed" | "failed";
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
  tokenUsage?: { prompt: number; completion: number };
  durationMs?: number;
}

/**
 * All possible agent termination reasons. Matches `AgentRunResult["finishReason"]`
 * from the engine but expressed as a frontend-local type to avoid importing
 * the backend package.
 */
export type FinishReason =
  | "completed"
  | "max_steps"
  | "error"
  | "cancelled"
  | "implicit_completion";

/** State for the max_steps confirmation card shown in the chat. */
export interface MaxStepsReachedInfo {
  totalSteps: number;
  finalMessage: string | null;
}

export interface GraphRunResultInfo {
  status: "completed" | "cancelled" | "failed";
  message: string | null;
}

export const useAgentStore = defineStore("agent", () => {
  // ─── State ───
  const definitions = ref<AgentDefinitionSummary[]>([]);
  const selectedDefinitionId = ref<string | null>(null);
  const sessions = ref<AgentSessionSummary[]>([]);
  const activeSessionId = ref<string | null>(null);
  const messages = ref<AgentMessageItem[]>([]);
  const streamingText = ref("");
  const thinkingText = ref("");
  const streamingStatus = ref<StreamingStatus>("idle");
  const runId = ref<string | null>(null);
  const nodeExecutions = shallowRef(new Map<string, NodeExecution>());
  const llmStreamingNodes = shallowRef(new Map<string, string>());
  const thinkingNodes = shallowRef(new Map<string, string>());
  const blackboardPreview = ref<Record<string, unknown>>({});
  const eventLog = shallowRef<GraphEvent[]>([]);
  const graphRunResult = ref<GraphRunResultInfo | null>(null);
  const currentSteps = shallowRef<AgentStepItem[]>([]);
  const errorMessage = ref<string | null>(null);

  /** Current pending tool confirmation dialog (null = none). */
  const pendingConfirmation = ref<PendingToolConfirmation | null>(null);

  /** Whether the agent is waiting for a client tool execution result. */
  // awaitingClientTool removed — client tools are no longer supported (Graph-only mode)

  /** Set when the agent hits the max_steps limit; drives the MaxSteps card. */
  const maxStepsReached = ref<MaxStepsReachedInfo | null>(null);

  /** The most recent finish reason from the engine. */
  const lastFinishReason = ref<FinishReason | null>(null);

  /** Stores the last user message so we can retry on error. */
  const lastUserMessage = ref<string | null>(null);

  /** DAG node events for the current run — PreCheck → Reasoning → Tool → Decision. */
  const dagNodeEvents = shallowRef<AgentDAGNodeEvent[]>([]);

  /** Current DAG turn index (incremented by DecisionNode each loop). */
  const currentTurn = ref(0);

  /** Kanban card linked to the current session (set when agent claims a card). */
  const currentKanbanCardId = ref<string | null>(null);

  // ─── Computed ───
  const selectedDefinition = computed(
    () =>
      definitions.value.find((d) => d.id === selectedDefinitionId.value) ??
      null,
  );

  const isStreaming = computed(() => streamingStatus.value === "streaming");

  const nodeExecutionList = computed(() => {
    return [...nodeExecutions.value.values()];
  });

  const applyGraphEvent = (_event: GraphEvent) => {
    return;
  };

  const consumeGraphEvents = async (graphRunId: string) => {
    const stream = await orpc.agent.graphEvents({
      runId: graphRunId,
      includeHistory: true,
    });

    // oxlint-disable-next-line no-await-in-loop -- streaming events must be handled in-order
    for await (const rawEvent of stream) {
      const payload = rawEvent.payload;
      const normalizedPayload =
        typeof payload === "object" &&
        payload !== null &&
        !Array.isArray(payload)
          ? { ...payload }
          : {};

      applyGraphEvent({
        eventId: rawEvent.eventId,
        runId: rawEvent.runId,
        nodeId: rawEvent.nodeId ?? undefined,
        parentEventId: rawEvent.parentEventId ?? undefined,
        type: rawEvent.type,
        timestamp: rawEvent.timestamp,
        payload: normalizedPayload,
      });
    }
  };

  const startGraphRun = async (params?: {
    graphId?: string;
    input?: Record<string, unknown>;
  }) => {
    const result = await orpc.agent.graphStart({
      graphId: params?.graphId ?? "react-loop",
      input: params?.input ?? {},
    });

    runId.value = result.runId;
    nodeExecutions.value = new Map();
    llmStreamingNodes.value = new Map();
    thinkingNodes.value = new Map();
    eventLog.value = [];
    blackboardPreview.value = {};
    streamingText.value = "";
    thinkingText.value = "";
    streamingStatus.value = "streaming";
    errorMessage.value = null;
    graphRunResult.value = null;

    await consumeGraphEvents(result.runId);
    return result.runId;
  };

  const pauseGraphRun = async () => {
    if (!runId.value) return;
    await orpc.agent.graphPause({ runId: runId.value });
    streamingStatus.value = "paused";
  };

  const resumeGraphRun = async () => {
    if (!runId.value) return;
    await orpc.agent.graphResume({ runId: runId.value });
    streamingStatus.value = "streaming";
  };

  const cancelGraphRun = async () => {
    if (!runId.value) return;
    await orpc.agent.graphCancel({ runId: runId.value });
    streamingStatus.value = "idle";
  };

  // ─── Actions ───

  const fetchDefinitions = async (options: {
    type?: AgentDefinitionType;
    scopeType?: ScopeType;
    scopeId?: string;
  }) => {
    try {
      const result = await orpc.agent.list({
        ...options,
      });
      definitions.value = result;
    } catch (err) {
      logger
        .withSituation("WEB")
        .error(err, "Failed to fetch agent definitions");
    }
  };

  const selectDefinition = (id: string | null) => {
    selectedDefinitionId.value = id;
    // Reset session when changing agent
    activeSessionId.value = null;
    messages.value = [];
    currentSteps.value = [];
    streamingText.value = "";
    thinkingText.value = "";
    streamingStatus.value = "idle";
    runId.value = null;
    nodeExecutions.value = new Map();
    llmStreamingNodes.value = new Map();
    thinkingNodes.value = new Map();
    blackboardPreview.value = {};
    eventLog.value = [];
    errorMessage.value = null;
    graphRunResult.value = null;
    maxStepsReached.value = null;
    lastFinishReason.value = null;
    lastUserMessage.value = null;
    dagNodeEvents.value = [];
    currentTurn.value = 0;
    currentKanbanCardId.value = null;
  };

  const fetchSessions = async (agentDefinitionId?: string) => {
    try {
      const result = await orpc.agent.listSessions({
        agentDefinitionId,
        limit: 20,
        offset: 0,
      });
      sessions.value = result.map((r) => ({
        id: r.id,
        status: r.status,
        metadata: r.metadata,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      logger.withSituation("WEB").error(err, "Failed to fetch sessions");
    }
  };

  const createSession = async (
    agentDefinitionId: string,
    metadata?: {
      projectId?: string;
    },
  ) => {
    try {
      const result = await orpc.agent.createSession({
        agentDefinitionId,
        projectId: metadata?.projectId,
      });
      activeSessionId.value = result.sessionId;
      return result.sessionId;
    } catch (err) {
      logger.withSituation("WEB").error(err, "Failed to create agent session");
      return "";
    }
  };

  let abortController: AbortController | null = null;

  const sendMessage = async (messageText: string) => {
    if (!activeSessionId.value) return;
    if (streamingStatus.value === "streaming") return;

    // Track for retry
    lastUserMessage.value = messageText;

    // Optimistically add user message
    messages.value.push({
      role: "USER",
      content: messageText,
      toolCallId: null,
      stepIndex: null,
      thinkingText: null,
      steps: [],
      createdAt: new Date(),
    });

    streamingText.value = "";
    thinkingText.value = "";
    streamingStatus.value = "streaming";
    currentSteps.value = [];
    errorMessage.value = null;
    graphRunResult.value = null;
    maxStepsReached.value = null;
    lastFinishReason.value = null;

    abortController = new AbortController();

    try {
      const stream = await orpc.agent.sendMessage(
        { sessionId: activeSessionId.value, message: messageText },
        { signal: abortController.signal },
      );

      // oxlint-disable-next-line no-await-in-loop -- streaming events must be handled in-order
      for await (const event of stream) {
        applyGraphEvent({
          eventId: event.eventId,
          runId: event.runId,
          nodeId: event.nodeId ?? undefined,
          parentEventId: event.parentEventId ?? undefined,
          type: event.type,
          timestamp: event.timestamp,
          payload:
            typeof event.payload === "object" &&
            event.payload !== null &&
            !Array.isArray(event.payload)
              ? { ...event.payload }
              : {},
        });
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        streamingStatus.value = "idle";
      } else {
        logger.withSituation("WEB").error(err, "Agent stream error");
        errorMessage.value =
          err instanceof Error ? err.message : "Unknown error";
        streamingStatus.value = "error";
      }
    } finally {
      abortController = null;
    }
  };

  const cancelStreaming = () => {
    void (async () => {
      if (runId.value) {
        await cancelGraphRun();
      }

      if (abortController) {
        abortController.abort();
        abortController = null;
      }

      streamingStatus.value = "idle";
      runId.value = null;
      pendingConfirmation.value = null;
      maxStepsReached.value = null;
      lastFinishReason.value = null;
    })();
  };

  /**
   * Respond to a pending tool confirmation request.
   * Called from the confirmation dialog UI.
   */
  const respondToConfirmation = async (
    decision: ToolConfirmResponse["decision"],
  ) => {
    if (!pendingConfirmation.value || !runId.value) return;

    const callId = pendingConfirmation.value.callId;
    const nodeId = pendingConfirmation.value.nodeId;
    pendingConfirmation.value = null;

    try {
      await orpc.agent.submitToolConfirmResponse({
        runId: runId.value,
        nodeId,
        response: { callId, decision },
      });
      streamingStatus.value = "streaming";
    } catch (err) {
      logger.withSituation("WEB").error(err, "Failed to submit confirmation");
    }
  };

  /**
   * Re-send the last user message. Useful for retrying after an error.
   */
  const retryLastMessage = async () => {
    if (!lastUserMessage.value) return;
    errorMessage.value = null;
    streamingStatus.value = "idle";
    await sendMessage(lastUserMessage.value);
  };

  /**
   * Continue the current session after a max_steps pause.
   * The session is still ACTIVE on the server; this sends a continuation
   * prompt so the agent picks up where it left off.
   */
  const extendAndContinue = async () => {
    if (!runId.value) return;
    maxStepsReached.value = null;
    lastFinishReason.value = null;
    await orpc.agent.graphResume({ runId: runId.value });
    streamingStatus.value = "streaming";
  };

  const reset = () => {
    selectedDefinitionId.value = null;
    activeSessionId.value = null;
    messages.value = [];
    currentSteps.value = [];
    streamingText.value = "";
    thinkingText.value = "";
    streamingStatus.value = "idle";
    runId.value = null;
    nodeExecutions.value = new Map();
    llmStreamingNodes.value = new Map();
    thinkingNodes.value = new Map();
    blackboardPreview.value = {};
    eventLog.value = [];
    graphRunResult.value = null;
    errorMessage.value = null;
    pendingConfirmation.value = null;
    sessions.value = [];
    maxStepsReached.value = null;
    lastFinishReason.value = null;
    lastUserMessage.value = null;
    dagNodeEvents.value = [];
    currentTurn.value = 0;
    currentKanbanCardId.value = null;
  };

  return {
    // State
    definitions,
    selectedDefinitionId,
    sessions,
    activeSessionId,
    messages,
    streamingText,
    thinkingText,
    streamingStatus,
    runId,
    nodeExecutions,
    llmStreamingNodes,
    thinkingNodes,
    blackboardPreview,
    eventLog,
    graphRunResult,
    currentSteps,
    errorMessage,
    pendingConfirmation,
    maxStepsReached,
    lastFinishReason,
    lastUserMessage,
    dagNodeEvents,
    currentTurn,
    currentKanbanCardId,
    // Computed
    selectedDefinition,
    isStreaming,
    nodeExecutionList,
    // Actions
    fetchDefinitions,
    selectDefinition,
    fetchSessions,
    createSession,
    sendMessage,
    startGraphRun,
    pauseGraphRun,
    resumeGraphRun,
    cancelGraphRun,
    applyGraphEvent,
    cancelStreaming,
    respondToConfirmation,
    retryLastMessage,
    extendAndContinue,
    reset,
  };
});
