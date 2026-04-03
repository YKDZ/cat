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

const toPlainRecord = (value: unknown): Record<string, unknown> | null => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const output: Record<string, unknown> = {};
  for (const [key, entryValue] of Object.entries(value)) {
    output[key] = entryValue;
  }
  return output;
};

/** State for the max_steps confirmation card shown in the chat. */
export interface MaxStepsReachedInfo {
  totalSteps: number;
  finalMessage: string | null;
}

export interface GraphRunResultInfo {
  status: "completed" | "cancelled" | "failed";
  message: string | null;
}

const cloneToolCall = (toolCall: AgentToolCallItem): AgentToolCallItem => {
  return {
    ...toolCall,
    arguments: { ...toolCall.arguments },
  };
};

const cloneStep = (step: AgentStepItem): AgentStepItem => {
  return {
    ...step,
    toolCalls: step.toolCalls.map((toolCall) => cloneToolCall(toolCall)),
  };
};

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
  const nodeExecutions = shallowRef<Map<string, NodeExecution>>(new Map());
  const llmStreamingNodes = shallowRef<Map<string, string>>(new Map());
  const thinkingNodes = shallowRef<Map<string, string>>(new Map());
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

  // ─── Computed ───
  const selectedDefinition = computed(
    () =>
      definitions.value.find((d) => d.id === selectedDefinitionId.value) ??
      null,
  );

  const isStreaming = computed(() => streamingStatus.value === "streaming");

  const nodeExecutionList = computed(() => {
    return [...nodeExecutions.value.values()].sort((a, b) => {
      const aTs = a.startedAt ? a.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
      const bTs = b.startedAt ? b.startedAt.getTime() : Number.MAX_SAFE_INTEGER;
      if (aTs !== bTs) return aTs - bTs;
      return a.nodeId.localeCompare(b.nodeId);
    });
  });

  const updateNodeExecution = (
    nodeId: string,
    updater: (current: NodeExecution | null) => NodeExecution,
  ) => {
    const next = new Map(nodeExecutions.value);
    const current = next.get(nodeId) ?? null;
    next.set(nodeId, updater(current));
    nodeExecutions.value = next;
  };

  const updateTextMap = (
    source: Map<string, string>,
    nodeId: string,
    value: string,
    target: "llm" | "thinking",
  ) => {
    const next = new Map(source);
    next.set(nodeId, value);
    if (target === "llm") {
      llmStreamingNodes.value = next;
    } else {
      thinkingNodes.value = next;
    }
  };

  const appendEvent = (event: GraphEvent) => {
    eventLog.value = [...eventLog.value, event];
  };

  const updateCurrentSteps = (
    updater: (steps: AgentStepItem[]) => AgentStepItem[],
  ) => {
    currentSteps.value = updater(
      currentSteps.value.map((step) => cloneStep(step)),
    );
  };

  const appendCurrentStep = (step: Omit<AgentStepItem, "index">) => {
    updateCurrentSteps((steps) => {
      return [
        ...steps,
        {
          ...step,
          index: steps.length,
        },
      ];
    });
  };

  const findToolCallLocation = (
    steps: AgentStepItem[],
    callId: string | null,
  ): { stepIndex: number; toolIndex: number } | null => {
    for (let stepIndex = steps.length - 1; stepIndex >= 0; stepIndex -= 1) {
      const step = steps[stepIndex];
      if (!step) continue;

      if (callId) {
        const toolIndex = step.toolCalls.findIndex(
          (toolCall) => toolCall.id === callId,
        );
        if (toolIndex >= 0) {
          return { stepIndex, toolIndex };
        }
      }

      if (step.toolCalls.length > 0) {
        return {
          stepIndex,
          toolIndex: step.toolCalls.length - 1,
        };
      }
    }

    return null;
  };

  const updateExistingToolCall = (
    callId: string | null,
    updater: (toolCall: AgentToolCallItem) => AgentToolCallItem,
  ): boolean => {
    let updated = false;

    updateCurrentSteps((steps) => {
      const location = findToolCallLocation(steps, callId);
      if (!location) return steps;

      const step = steps[location.stepIndex];
      if (!step) return steps;
      const toolCall = step.toolCalls[location.toolIndex];
      if (!toolCall) return steps;

      step.toolCalls.splice(location.toolIndex, 1, updater(toolCall));
      updated = true;
      return steps;
    });

    return updated;
  };

  const buildStepsSnapshot = (): AgentStepItem[] => {
    return currentSteps.value.map((step) => cloneStep(step));
  };

  const getCallId = (payload: Record<string, unknown>): string | null => {
    const callId = payload["callId"];
    return typeof callId === "string" && callId.length > 0 ? callId : null;
  };

  const applyGraphEvent = (event: GraphEvent) => {
    runId.value = event.runId;
    appendEvent(event);

    const eventDate = new Date(event.timestamp);

    if (event.type === "run:start") {
      streamingStatus.value = "streaming";
      errorMessage.value = null;
      graphRunResult.value = null;
      return;
    }

    if (event.type === "run:pause") {
      streamingStatus.value = "paused";
      return;
    }

    if (event.type === "run:cancel") {
      streamingStatus.value = "idle";
      graphRunResult.value = {
        status: "cancelled",
        message: null,
      };
      runId.value = null;
      return;
    }

    if (event.type === "run:resume") {
      streamingStatus.value = "streaming";
      return;
    }

    if (event.type === "run:end") {
      const payloadStatus = event.payload["status"];
      const finishReason = event.payload["finishReason"];
      lastFinishReason.value =
        finishReason === "completed" ||
        finishReason === "max_steps" ||
        finishReason === "error" ||
        finishReason === "cancelled" ||
        finishReason === "implicit_completion"
          ? finishReason
          : null;

      if (payloadStatus === "completed") {
        streamingStatus.value = "done";
        graphRunResult.value = {
          status: "completed",
          message: null,
        };
      } else if (payloadStatus === "cancelled") {
        streamingStatus.value = "idle";
        graphRunResult.value = {
          status: "cancelled",
          message: null,
        };
      } else {
        streamingStatus.value = "error";
        graphRunResult.value = {
          status: "failed",
          message: typeof payloadStatus === "string" ? payloadStatus : null,
        };
      }

      const blackboard = event.payload["blackboard"];
      if (
        typeof blackboard === "object" &&
        blackboard !== null &&
        !Array.isArray(blackboard)
      ) {
        blackboardPreview.value = { ...blackboard };
      }

      runId.value = null;
      return;
    }

    if (event.type === "run:error") {
      const error = event.payload["error"];
      errorMessage.value =
        typeof error === "string" ? error : "Graph run error";
      streamingStatus.value = "error";
      graphRunResult.value = {
        status: "failed",
        message: typeof error === "string" ? error : null,
      };
      runId.value = null;
      return;
    }

    if (event.type === "node:start" && event.nodeId) {
      const nodeId = event.nodeId;
      const nodeTypeRaw = event.payload["nodeType"];
      const nodeType =
        nodeTypeRaw === "llm" ||
        nodeTypeRaw === "tool" ||
        nodeTypeRaw === "router" ||
        nodeTypeRaw === "human_input" ||
        nodeTypeRaw === "parallel" ||
        nodeTypeRaw === "join" ||
        nodeTypeRaw === "transform" ||
        nodeTypeRaw === "loop" ||
        nodeTypeRaw === "subgraph"
          ? nodeTypeRaw
          : "tool";

      updateNodeExecution(nodeId, (current) => ({
        nodeId,
        nodeType,
        status: "running",
        startedAt: current?.startedAt ?? eventDate,
        completedAt: null,
        input: current?.input,
        output: current?.output,
      }));
      return;
    }

    if (event.type === "node:end" && event.nodeId) {
      const nodeId = event.nodeId;
      const outputRaw = event.payload["output"];
      updateNodeExecution(nodeId, (current) => ({
        nodeId,
        nodeType: current?.nodeType ?? "tool",
        status: "completed",
        startedAt: current?.startedAt ?? null,
        completedAt: eventDate,
        input: current?.input,
        output:
          typeof outputRaw === "object" &&
          outputRaw !== null &&
          !Array.isArray(outputRaw)
            ? { ...outputRaw }
            : current?.output,
        streamingText: current?.streamingText,
        thinkingText: current?.thinkingText,
        toolCalls: current?.toolCalls,
      }));
      return;
    }

    if (event.type === "node:error" && event.nodeId) {
      const nodeId = event.nodeId;
      const error = event.payload["error"];
      updateNodeExecution(nodeId, (current) => ({
        nodeId,
        nodeType: current?.nodeType ?? "tool",
        status: "error",
        startedAt: current?.startedAt ?? null,
        completedAt: eventDate,
        error: typeof error === "string" ? error : "Node execution failed",
        input: current?.input,
        output: current?.output,
        streamingText: current?.streamingText,
        thinkingText: current?.thinkingText,
        toolCalls: current?.toolCalls,
      }));
      return;
    }

    if (event.type === "llm:thinking" && event.nodeId) {
      const nodeId = event.nodeId;
      const delta = event.payload["delta"];
      if (typeof delta !== "string" || delta.length === 0) return;

      thinkingText.value += delta;
      const previousThinking = thinkingNodes.value.get(nodeId) ?? "";
      const nextThinking = `${previousThinking}${delta}`;
      updateTextMap(thinkingNodes.value, nodeId, nextThinking, "thinking");
      updateNodeExecution(nodeId, (current) => ({
        nodeId,
        nodeType: current?.nodeType ?? "llm",
        status: current?.status ?? "running",
        startedAt: current?.startedAt ?? eventDate,
        completedAt: current?.completedAt ?? null,
        input: current?.input,
        output: current?.output,
        streamingText: current?.streamingText,
        thinkingText: nextThinking,
        toolCalls: current?.toolCalls,
      }));
      return;
    }

    if (event.type === "llm:token" && event.nodeId) {
      const nodeId = event.nodeId;
      const delta = event.payload["delta"];
      if (typeof delta === "string") {
        const prev = llmStreamingNodes.value.get(nodeId) ?? "";
        const next = `${prev}${delta}`;
        updateTextMap(llmStreamingNodes.value, nodeId, next, "llm");
        updateNodeExecution(nodeId, (current) => ({
          nodeId,
          nodeType: current?.nodeType ?? "llm",
          status: current?.status ?? "running",
          startedAt: current?.startedAt ?? eventDate,
          completedAt: current?.completedAt ?? null,
          input: current?.input,
          output: current?.output,
          streamingText: next,
          thinkingText: current?.thinkingText,
          toolCalls: current?.toolCalls,
        }));

        // 兼容现有 UI 的全局流式文本展示
        streamingText.value += delta;
      }
      return;
    }

    if (event.type === "llm:complete" && event.nodeId) {
      const nodeId = event.nodeId;
      const content = event.payload["content"];
      const finalContent = typeof content === "string" ? content : "";
      const thinking = event.payload["thinking"];
      const toolCalls = event.payload["toolCalls"];
      const thinkingSnapshot =
        typeof thinking === "string" ? thinking : thinkingText.value;
      const hasToolCalls = Array.isArray(toolCalls) && toolCalls.length > 0;

      updateTextMap(llmStreamingNodes.value, nodeId, finalContent, "llm");
      updateNodeExecution(nodeId, (current) => ({
        nodeId,
        nodeType: current?.nodeType ?? "llm",
        status: "completed",
        startedAt: current?.startedAt ?? null,
        completedAt: eventDate,
        input: current?.input,
        output: current?.output,
        streamingText: finalContent,
        thinkingText:
          typeof thinkingSnapshot === "string"
            ? thinkingSnapshot
            : current?.thinkingText,
        toolCalls: current?.toolCalls,
      }));

      if (thinkingSnapshot || hasToolCalls) {
        appendCurrentStep({
          thought:
            hasToolCalls && finalContent.trim().length > 0
              ? finalContent
              : null,
          thinkingText: thinkingSnapshot || null,
          toolCalls: [],
          isFinish: !hasToolCalls,
        });
      }

      if (!hasToolCalls && finalContent.trim().length > 0) {
        messages.value.push({
          role: "ASSISTANT",
          content: finalContent,
          toolCallId: null,
          stepIndex: null,
          thinkingText: null,
          steps: buildStepsSnapshot(),
          createdAt: eventDate,
        });
        currentSteps.value = [];
      }

      streamingText.value = "";
      thinkingText.value = "";
      return;
    }

    if (event.type === "tool:confirm:required") {
      const toolName = event.payload["toolName"];
      const callId =
        getCallId(event.payload) ??
        `${event.nodeId ?? "tool"}-${event.eventId}`;
      pendingConfirmation.value = {
        callId,
        nodeId: event.nodeId,
        toolName: typeof toolName === "string" ? toolName : "tool",
        description: "Graph tool confirmation required",
        arguments: toPlainRecord(event.payload["args"]) ?? {},
        riskLevel: "medium",
      };
      streamingStatus.value = "waiting_input";
      return;
    }

    if (event.type === "tool:call" && event.nodeId) {
      const nodeId = event.nodeId;
      const toolName = event.payload["toolName"];
      const args = event.payload["args"];
      const callId = getCallId(event.payload) ?? event.eventId;
      updateNodeExecution(nodeId, (current) => {
        const toolCalls = [...(current?.toolCalls ?? [])];
        toolCalls.push({
          id: callId,
          toolName: typeof toolName === "string" ? toolName : "tool",
          arguments: toPlainRecord(args) ?? {},
          result: null,
          error: null,
          durationMs: null,
          target: "server",
          confirmationStatus: null,
          nodeId,
        });

        return {
          nodeId,
          nodeType: current?.nodeType ?? "tool",
          status: current?.status ?? "running",
          startedAt: current?.startedAt ?? eventDate,
          completedAt: current?.completedAt ?? null,
          input: current?.input,
          output: current?.output,
          streamingText: current?.streamingText,
          thinkingText: current?.thinkingText,
          toolCalls,
        };
      });

      updateCurrentSteps((steps) => {
        const next = steps.map((step) => cloneStep(step));
        const lastStep = next.at(-1);
        const targetStep = lastStep ?? {
          index: next.length,
          thought: null,
          thinkingText: null,
          toolCalls: [],
        };

        targetStep.toolCalls.push({
          id: callId,
          nodeId,
          toolName: typeof toolName === "string" ? toolName : "tool",
          arguments: toPlainRecord(args) ?? {},
          result: null,
          error: null,
          durationMs: null,
          target: "server",
          confirmationStatus: null,
        });

        if (!lastStep) {
          next.push(targetStep);
        }

        return next;
      });
      return;
    }

    if (event.type === "tool:result" && event.nodeId) {
      const nodeId = event.nodeId;
      const result = event.payload["result"];
      const durationMs = event.payload["durationMs"];
      const callId = getCallId(event.payload);
      updateNodeExecution(nodeId, (current) => {
        const toolCalls = [...(current?.toolCalls ?? [])];
        const last = callId
          ? toolCalls.find((toolCall) => toolCall.id === callId)
          : toolCalls.at(-1);
        if (last) {
          last.result = result;
          last.error = null;
          last.durationMs = typeof durationMs === "number" ? durationMs : null;
        }
        return {
          nodeId,
          nodeType: current?.nodeType ?? "tool",
          status: current?.status ?? "running",
          startedAt: current?.startedAt ?? eventDate,
          completedAt: current?.completedAt ?? null,
          input: current?.input,
          output: current?.output,
          streamingText: current?.streamingText,
          thinkingText: current?.thinkingText,
          toolCalls,
        };
      });

      updateExistingToolCall(callId, (toolCall) => ({
        ...toolCall,
        result,
        error: null,
        durationMs: typeof durationMs === "number" ? durationMs : null,
      }));
      return;
    }

    if (event.type === "tool:error" && event.nodeId) {
      const nodeId = event.nodeId;
      const error = event.payload["error"];
      const callId = getCallId(event.payload);
      updateNodeExecution(nodeId, (current) => {
        const toolCalls = [...(current?.toolCalls ?? [])];
        const last = callId
          ? toolCalls.find((toolCall) => toolCall.id === callId)
          : toolCalls.at(-1);
        if (last) {
          last.error = typeof error === "string" ? error : "Tool error";
        }
        return {
          nodeId,
          nodeType: current?.nodeType ?? "tool",
          status: "error",
          startedAt: current?.startedAt ?? eventDate,
          completedAt: eventDate,
          error: typeof error === "string" ? error : "Tool error",
          input: current?.input,
          output: current?.output,
          streamingText: current?.streamingText,
          thinkingText: current?.thinkingText,
          toolCalls,
        };
      });

      updateExistingToolCall(callId, (toolCall) => ({
        ...toolCall,
        error: typeof error === "string" ? error : "Tool error",
      }));
      return;
    }

    if (event.type === "human:input:required") {
      streamingStatus.value = "waiting_input";
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
      documentId?: string;
      elementId?: number;
      languageId?: string;
      sourceLanguageId?: string;
      userId?: string;
    },
  ) => {
    try {
      const result = await orpc.agent.createSession({
        agentDefinitionId,
        metadata,
      });
      activeSessionId.value = result.sessionId;
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
      return result.sessionId;
    } catch (err) {
      logger.withSituation("WEB").error(err, "Failed to create agent session");
      return null;
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
