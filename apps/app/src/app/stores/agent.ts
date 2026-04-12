import type { ToolConfirmResponse } from "@cat/shared/schema/agent";
import type { AgentSessionMetadata } from "@cat/shared/schema/agent";
import type { AgentDefinitionType, ScopeType } from "@cat/shared/schema/enum";

import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import type { GraphEvent, NodeExecution } from "@/app/types/agent-graph";

import { orpc } from "@/app/rpc/orpc";
import { hydrateSessionState } from "@/app/utils/agent";
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
  metadata: AgentSessionContext | null;
  createdAt: Date;
}

export interface SessionListFilter {
  projectId?: string;
  agentDefinitionId?: string;
}

/**
 * @zh 前端持有的会话上下文元数据。
 * @en Session context metadata held by the frontend.
 */
export type AgentSessionContext = AgentSessionMetadata;

/**
 * @zh 从服务端会话状态接口归一化后的 hydration 结果。
 * @en Normalized hydration result returned from the server session-state API.
 */
export interface HydratedSessionState {
  sessionId: string;
  agentDefinitionId: string;
  status: string;
  metadata: AgentSessionContext | null;
  runId: string | null;
  runStatus: string | null;
  blackboardSnapshot: Record<string, unknown> | null;
  messages: AgentMessageItem[];
  currentKanbanCardId: string | null;
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
  const sessionListFilter = ref<SessionListFilter>({});
  const activeSessionId = ref<string | null>(null);
  const activeSessionContext = ref<AgentSessionContext | null>(null);
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

  const applyGraphEvent = (event: GraphEvent) => {
    const payload = event.payload;

    switch (event.type) {
      case "run:start": {
        runId.value = event.runId;
        streamingStatus.value = "streaming";
        break;
      }

      case "node:start": {
        // Clear thinking text for new reasoning nodes
        if (payload.nodeType === "llm") {
          thinkingText.value = "";
        }
        break;
      }

      case "node:end": {
        // Clear thinking when reasoning completes (fallback — llm:complete should do it first)
        if (payload.nodeType === "llm") {
          thinkingText.value = "";
        }
        break;
      }

      case "node:error": {
        thinkingText.value = "";
        break;
      }

      case "tool:call": {
        const toolName =
          typeof payload.toolName === "string" ? payload.toolName : "unknown";
        const toolCallId =
          typeof payload.toolCallId === "string"
            ? payload.toolCallId
            : crypto.randomUUID();

        // Add a new step with the tool call
        const stepIndex = currentSteps.value.length;
        currentSteps.value = [
          ...currentSteps.value,
          {
            index: stepIndex,
            thought: null,
            thinkingText: null,
            toolCalls: [
              {
                id: toolCallId,
                toolName,
                arguments: {},
                result: null,
                error: null,
                durationMs: null,
              },
            ],
          },
        ];
        break;
      }

      case "tool:result": {
        const toolCallId =
          typeof payload.toolCallId === "string" ? payload.toolCallId : "";
        const content =
          typeof payload.content === "string" ? payload.content : "";

        // Update the matching tool call with the result
        const updatedSteps = currentSteps.value.map((step) => ({
          ...step,
          toolCalls: step.toolCalls.map((tc) =>
            tc.id === toolCallId ? { ...tc, result: content } : tc,
          ),
        }));
        currentSteps.value = updatedSteps;
        break;
      }

      case "run:end": {
        const finalMessage =
          typeof payload.finalMessage === "string"
            ? payload.finalMessage
            : null;

        if (finalMessage) {
          messages.value.push({
            role: "ASSISTANT",
            content: finalMessage,
            toolCallId: null,
            stepIndex: null,
            thinkingText: null,
            steps: [...currentSteps.value],
            createdAt: new Date(),
          });
        }

        const status =
          typeof payload.status === "string" ? payload.status : "completed";
        if (status === "finish" || status === "completed") {
          lastFinishReason.value = "completed";
        } else if (status === "maxTurns") {
          lastFinishReason.value = "max_steps";
          maxStepsReached.value = {
            totalSteps: currentSteps.value.length,
            finalMessage,
          };
        } else {
          lastFinishReason.value = "completed";
        }

        streamingText.value = "";
        thinkingText.value = "";
        currentSteps.value = [];
        streamingStatus.value = "done";
        break;
      }

      case "run:error": {
        const errorMsg =
          typeof payload.error === "string" ? payload.error : "Unknown error";
        errorMessage.value = errorMsg;
        lastFinishReason.value = "error";
        streamingText.value = "";
        thinkingText.value = "";
        currentSteps.value = [];
        streamingStatus.value = "error";
        break;
      }

      // Unhandled event types — no client-side action needed
      case "run:pause":
      case "run:resume":
      case "run:cancel":
      case "run:compensation:start":
      case "run:compensation:end":
      case "node:retry":
      case "node:lease:acquired":
      case "node:lease:expired":
      case "node:lease:reclaimed":
      case "llm:token":
      case "llm:error":
      case "tool:error":
      case "tool:confirm:required":
      case "tool:confirm:response":
      case "human:input:required":
      case "human:input:received":
      case "checkpoint:saved":
      case "workflow:translation:created":
      case "workflow:qa:issue":
      case "workflow:suggestion:ready":
        break;

      case "llm:thinking": {
        const delta =
          typeof payload.thinkingDelta === "string"
            ? payload.thinkingDelta
            : "";
        thinkingText.value += delta;
        break;
      }

      case "llm:complete": {
        const fullThinking =
          typeof payload.thinkingText === "string"
            ? payload.thinkingText
            : null;
        // Archive thinking to current step for history replay
        if (fullThinking) {
          if (currentSteps.value.length > 0) {
            const steps = [...currentSteps.value];
            const lastStep = { ...steps[steps.length - 1] };
            lastStep.thinkingText = fullThinking;
            steps[steps.length - 1] = lastStep;
            currentSteps.value = steps;
          } else {
            // No tool-call step yet — create a thinking-only step
            currentSteps.value = [
              ...currentSteps.value,
              {
                index: currentSteps.value.length,
                thought: null,
                thinkingText: fullThinking,
                toolCalls: [],
              },
            ];
          }
        }
        thinkingText.value = "";
        break;
      }
    }
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
    activeSessionContext.value = null;
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

  const fetchSessions = async (
    filter: {
      projectId?: string;
      agentDefinitionId?: string;
    } = sessionListFilter.value,
  ) => {
    try {
      sessionListFilter.value = { ...filter };
      const result = await orpc.agent.listSessions({
        ...filter,
        limit: 20,
        offset: 0,
      });
      sessions.value = result.map((r) => ({
        id: r.id,
        status: r.status,
        metadata:
          r.metadata &&
          typeof r.metadata === "object" &&
          !Array.isArray(r.metadata)
            ? (r.metadata as AgentSessionContext)
            : null,
        createdAt: r.createdAt,
      }));
    } catch (err) {
      logger.withSituation("WEB").error(err, "Failed to fetch sessions");
    }
  };

  const resetRuntimeStateButKeepDefinitions = () => {
    messages.value = [];
    currentSteps.value = [];
    streamingText.value = "";
    thinkingText.value = "";
    streamingStatus.value = "idle";
    runId.value = null;
    activeSessionContext.value = null;
    nodeExecutions.value = new Map();
    llmStreamingNodes.value = new Map();
    thinkingNodes.value = new Map();
    blackboardPreview.value = {};
    eventLog.value = [];
    errorMessage.value = null;
    graphRunResult.value = null;
    maxStepsReached.value = null;
    lastFinishReason.value = null;
    currentTurn.value = 0;
    currentKanbanCardId.value = null;
  };

  const loadSession = async (sessionId: string) => {
    const state = hydrateSessionState(
      await orpc.agent.getSessionState({ sessionId }),
    );

    activeSessionId.value = state.sessionId;
    selectedDefinitionId.value = state.agentDefinitionId;
    activeSessionContext.value = state.metadata;
    runId.value = state.runId;
    messages.value = state.messages;
    currentKanbanCardId.value = state.currentKanbanCardId;
    streamingStatus.value = "idle";
  };

  const switchSession = async (sessionId: string) => {
    if (activeSessionId.value === sessionId) return;
    resetRuntimeStateButKeepDefinitions();

    try {
      await loadSession(sessionId);
    } catch (err) {
      logger.withSituation("WEB").error(err, "Failed to load agent session");
    }
  };

  const createSession = async (
    agentDefinitionId: string,
    metadata?: AgentSessionContext,
  ) => {
    try {
      const result = await orpc.agent.createSession({
        agentDefinitionId,
        projectId: metadata?.projectId,
        metadata,
      });
      activeSessionId.value = result.sessionId;
      activeSessionContext.value = metadata ?? null;
      runId.value = result.runId;
      if (sessionListFilter.value.projectId || metadata?.projectId) {
        await fetchSessions({
          ...sessionListFilter.value,
          projectId: sessionListFilter.value.projectId ?? metadata?.projectId,
        });
      }
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

      // Safety net: if stream ended without a run:end/run:error event
      if (streamingStatus.value === "streaming") {
        streamingStatus.value = "done";
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
    activeSessionContext.value = null;
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
    sessionListFilter.value = {};
  };

  return {
    // State
    definitions,
    selectedDefinitionId,
    sessions,
    sessionListFilter,
    activeSessionId,
    activeSessionContext,
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
    loadSession,
    switchSession,
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
