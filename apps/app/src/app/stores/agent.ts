import type { ToolConfirmResponse } from "@cat/shared/schema/agent";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

import { logger } from "@cat/shared/utils";
import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";

import { executeClientTool } from "@/app/utils/agent/client-tool-registry";
import { orpc } from "@/server/orpc";
import { ws } from "@/server/ws";

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
  toolName: string;
  description: string;
  arguments: Record<string, unknown>;
  riskLevel: "low" | "medium" | "high";
}

export type StreamingStatus = "idle" | "streaming" | "error" | "done";

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

const FINISH_REASONS: ReadonlySet<string> = new Set([
  "completed",
  "max_steps",
  "error",
  "cancelled",
  "implicit_completion",
]);

const isFinishReason = (value: string): value is FinishReason =>
  FINISH_REASONS.has(value);

const toFinishReason = (value: string): FinishReason =>
  isFinishReason(value) ? value : "completed";

/** State for the max_steps confirmation card shown in the chat. */
export interface MaxStepsReachedInfo {
  totalSteps: number;
  finalMessage: string | null;
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
  const currentSteps = shallowRef<AgentStepItem[]>([]);
  const errorMessage = ref<string | null>(null);

  /** Current pending tool confirmation dialog (null = none). */
  const pendingConfirmation = ref<PendingToolConfirmation | null>(null);

  /** Whether the agent is waiting for a client tool execution result. */
  const awaitingClientTool = ref(false);

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

  // ─── Actions ───

  const fetchDefinitions = async (scopeType?: ScopeType, scopeId?: string) => {
    try {
      const result = await orpc.agent.list({ scopeType, scopeId });
      definitions.value = result.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        scopeType: r.scopeType,
        scopeId: r.scopeId,
        isBuiltin: r.isBuiltin,
      }));
    } catch (err) {
      logger.error("WEB", { msg: "Failed to fetch agent definitions" }, err);
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
    errorMessage.value = null;
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
      logger.error("WEB", { msg: "Failed to fetch sessions" }, err);
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
      errorMessage.value = null;
      maxStepsReached.value = null;
      lastFinishReason.value = null;
      lastUserMessage.value = null;
      return result.sessionId;
    } catch (err) {
      logger.error("WEB", { msg: "Failed to create agent session" }, err);
      return null;
    }
  };

  const loadSessionMessages = async (sessionId: string) => {
    try {
      activeSessionId.value = sessionId;
      const result = await orpc.agent.getSessionMessages({ sessionId });
      messages.value = result.map((m) => ({
        role: m.role,
        content: m.content,
        toolCallId: m.toolCallId,
        stepIndex: m.stepIndex,
        thinkingText: null,
        steps: [],
        createdAt:
          m.createdAt instanceof Date ? m.createdAt : new Date(m.createdAt),
      }));
      currentSteps.value = [];
      streamingText.value = "";
      thinkingText.value = "";
      streamingStatus.value = "idle";
      errorMessage.value = null;
      maxStepsReached.value = null;
      lastFinishReason.value = null;
    } catch (err) {
      logger.error("WEB", { msg: "Failed to load session messages" }, err);
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
    maxStepsReached.value = null;
    lastFinishReason.value = null;

    abortController = new AbortController();

    try {
      const stream = await orpc.agent.sendMessage(
        {
          sessionId: activeSessionId.value,
          message: messageText,
        },
        { signal: abortController.signal },
      );

      // oxlint-disable-next-line no-await-in-loop -- streaming requires sequential chunk processing
      for await (const chunk of stream) {
        if (chunk.type === "text_delta") {
          streamingText.value += chunk.text;
        } else if (chunk.type === "thinking_delta") {
          thinkingText.value += chunk.text;
        } else if (chunk.type === "correction_retry") {
          // The engine is retrying because the LLM didn't call finish_task.
          // Reset streaming accumulators so the retry streams cleanly
          // without appending to stale text from the failed attempt.
          streamingText.value = "";
          thinkingText.value = "";
        } else if (chunk.type === "step") {
          const step = chunk.step;
          // Capture current live thinkingText as this step's thinking (step's own thinkingText from engine)
          const stepThinkingText: string | null =
            (step.thinkingText as string | null | undefined) ??
            (thinkingText.value || null);

          // On a **finish step** (isFinish === true) we keep streamingText
          // alive so the user continues to see the final response streaming
          // in the MessageBubble.  On intermediate steps we reset as before.
          if (!step.isFinish) {
            streamingText.value = "";
          }
          thinkingText.value = "";

          currentSteps.value = [
            ...currentSteps.value,
            {
              index: step.index,
              thought: step.thought,
              thinkingText: stepThinkingText,
              isFinish: step.isFinish,
              // Filter out the finish_task control tool — it's a termination
              // signal, not a real action, and must not appear in the UI timeline.
              toolCalls: step.toolCalls
                .filter((tc) => tc.toolName !== "finish_task")
                .map((tc) => ({
                  id: tc.id,
                  toolName: tc.toolName,
                  arguments: tc.arguments,
                  result: tc.result,
                  error: tc.error,
                  durationMs: tc.durationMs,
                })),
            },
          ];
        } else if (chunk.type === "tool_confirm_request") {
          // Show confirmation dialog to user
          const request = chunk.request;
          pendingConfirmation.value = {
            callId: request.callId,
            toolName: request.toolName,
            description: request.description,
            arguments: request.arguments,
            riskLevel: request.riskLevel,
          };
        } else if (chunk.type === "tool_execute_request") {
          // Execute client tool locally and send result back
          const request = chunk.request;
          awaitingClientTool.value = true;
          const execResult = await executeClientTool(
            request.toolName,
            request.arguments,
          );
          awaitingClientTool.value = false;

          // Send result back to server via WebSocket
          await ws.agent.submitToolExecuteResult({
            sessionId: activeSessionId.value,
            response: {
              callId: request.callId,
              result: execResult.result,
              error: execResult.error,
            },
          });
        } else if (chunk.type === "done") {
          const {
            finishReason: rawFinishReason,
            totalSteps,
            finalMessage,
          } = chunk.result;
          const finishReason = toFinishReason(rawFinishReason);
          lastFinishReason.value = finishReason;

          // Prefer the live streamingText (what the user was reading in the
          // streaming bubble) over the server's finalMessage so there is zero
          // visual discontinuity when the bubble finalises.
          const finalContent = streamingText.value || finalMessage || null;

          const pushAssistantMessage = (content: string) => {
            messages.value.push({
              role: "ASSISTANT",
              content,
              toolCallId: null,
              stepIndex: null,
              thinkingText: thinkingText.value || null,
              steps: [...currentSteps.value],
              createdAt: new Date(),
            });
          };

          if (finishReason === "max_steps") {
            // Push partial content so user can see what the agent managed so far.
            if (finalContent) pushAssistantMessage(finalContent);
            maxStepsReached.value = { totalSteps, finalMessage };
            streamingStatus.value = "done";
          } else if (finishReason === "implicit_completion") {
            // The agent never called a finish tool; content is a best-effort fallback.
            if (finalContent) pushAssistantMessage(finalContent);
            streamingStatus.value = "done";
          } else if (finishReason === "error") {
            if (finalContent) pushAssistantMessage(finalContent);
            errorMessage.value = finalMessage || "Agent encountered an error";
            streamingStatus.value = "error";
          } else {
            // "completed" (or any future reason) — normal happy path.
            if (finalContent) pushAssistantMessage(finalContent);
            streamingStatus.value = "done";
          }
        } else if (chunk.type === "error") {
          // Transport-level / stream-level error (distinct from agent finishReason "error")
          errorMessage.value = chunk.message;
          streamingStatus.value = "error";
        }
      }
    } catch (err) {
      if (abortController.signal.aborted) {
        streamingStatus.value = "idle";
      } else {
        logger.error("WEB", { msg: "Agent stream error" }, err);
        errorMessage.value =
          err instanceof Error ? err.message : "Unknown error";
        streamingStatus.value = "error";
      }
    } finally {
      abortController = null;
    }
  };

  const cancelStreaming = () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
    streamingStatus.value = "idle";
    pendingConfirmation.value = null;
    awaitingClientTool.value = false;
    maxStepsReached.value = null;
    lastFinishReason.value = null;
  };

  /**
   * Respond to a pending tool confirmation request.
   * Called from the confirmation dialog UI.
   */
  const respondToConfirmation = async (
    decision: ToolConfirmResponse["decision"],
  ) => {
    if (!pendingConfirmation.value || !activeSessionId.value) return;

    const callId = pendingConfirmation.value.callId;
    pendingConfirmation.value = null;

    try {
      await ws.agent.submitToolConfirmResponse({
        sessionId: activeSessionId.value,
        response: { callId, decision },
      });
    } catch (err) {
      logger.error("WEB", { msg: "Failed to submit confirmation" }, err);
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
  const extendAndContinue = async (additionalSteps: number) => {
    if (!activeSessionId.value || !maxStepsReached.value) return;
    maxStepsReached.value = null;
    lastFinishReason.value = null;
    await sendMessage(
      `Continue the task. You have ${String(additionalSteps)} more steps available.`,
    );
  };

  const reset = () => {
    selectedDefinitionId.value = null;
    activeSessionId.value = null;
    messages.value = [];
    currentSteps.value = [];
    streamingText.value = "";
    thinkingText.value = "";
    streamingStatus.value = "idle";
    errorMessage.value = null;
    pendingConfirmation.value = null;
    awaitingClientTool.value = false;
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
    currentSteps,
    errorMessage,
    pendingConfirmation,
    awaitingClientTool,
    maxStepsReached,
    lastFinishReason,
    lastUserMessage,
    // Computed
    selectedDefinition,
    isStreaming,
    // Actions
    fetchDefinitions,
    selectDefinition,
    fetchSessions,
    createSession,
    loadSessionMessages,
    sendMessage,
    cancelStreaming,
    respondToConfirmation,
    retryLastMessage,
    extendAndContinue,
    reset,
  };
});
