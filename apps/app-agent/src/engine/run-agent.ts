import type { ChatMessage, ToolDefinition } from "@cat/plugin-core";
import type { JSONSchema } from "@cat/shared/schema/json";

import z from "zod";

import type {
  AgentToolDefinition,
  ToolConfirmationPolicy,
} from "@/tools/types";

import type {
  AgentRunOptions,
  AgentRunResult,
  AgentStep,
  ToolCallRecord,
} from "./types";

import { ContextManager } from "./context-manager";

const DEFAULT_MAX_STEPS = 10;
const DEFAULT_MAX_CORRECTION_ATTEMPTS = 2;
const LLM_RETRY_ATTEMPTS = 3;
const LLM_RETRY_BASE_MS = 1000;
const TOOL_CALL_TIMEOUT_MS = 15_000;

const CORRECTION_PROMPT =
  "You MUST call the termination tool (e.g. `finish_task`) to end the conversation. " +
  "Write your final response as normal text first, then call the tool to signal completion.";

const FINISH_TOOL_SYSTEM_RULE =
  "IMPORTANT: When you have finished the task or answered the user's question, " +
  "first write your full response as normal text, then call the `finish_task` " +
  "tool (with no arguments) to signal that you are done. The user sees your " +
  "text as it streams — the tool call is only a termination signal. " +
  "NEVER end your turn with plain text alone; always finish with the tool call.";

export const runAgent = async (
  options: AgentRunOptions,
): Promise<AgentRunResult> => {
  const {
    tools,
    llmProvider,
    signal,
    sessionId,
    traceId,
    onStep,
    onChunk,
    onToolConfirmRequest,
    onToolExecuteRequest,
    onCorrectionRetry,
    sessionTrustPolicy = "confirm_all",
    trustedToolNames = new Set<string>(),
  } = options;

  const maxSteps =
    options.definition.constraints?.maxSteps ??
    options.maxSteps ??
    DEFAULT_MAX_STEPS;

  const maxConcurrent =
    options.definition.constraints?.maxConcurrentToolCalls ?? 3;

  const maxCorrectionAttempts =
    options.definition.constraints?.maxCorrectionAttempts ??
    DEFAULT_MAX_CORRECTION_ATTEMPTS;

  const toolMap = new Map(tools.map((t) => [t.name, t]));
  const hasFinishTool = tools.some((t) => t.isFinishTool);

  const toolDefinitions: ToolDefinition[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: z.toJSONSchema(t.parameters) as JSONSchema,
  }));

  const contextManager = new ContextManager(options.messages);

  if (hasFinishTool) {
    const finishToolNames = tools
      .filter((t) => t.isFinishTool)
      .map((t) => `\`${t.name}\``);
    const rule =
      finishToolNames.length === 1
        ? FINISH_TOOL_SYSTEM_RULE
        : FINISH_TOOL_SYSTEM_RULE.replace(
            "`finish_task` tool",
            `one of the termination tools (${finishToolNames.join(", ")})`,
          );
    contextManager.appendToSystemPrompt(rule);
  }

  const steps: AgentStep[] = [];
  let finalMessage: string | null = null;
  let currentStepThinking = "";
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let finishReason: AgentRunResult["finishReason"] = "max_steps";
  let correctionCount = 0;

  for (let stepIndex = 0; stepIndex < maxSteps; stepIndex += 1) {
    if (signal?.aborted) {
      finishReason = "cancelled";
      break;
    }

    currentStepThinking = "";

    // oxlint-disable-next-line no-await-in-loop -- ReAct loop is inherently sequential
    const response = await callLLMWithRetry(
      async () =>
        llmProvider.chat({
          messages: contextManager.getMessages(),
          tools: toolDefinitions.length > 0 ? toolDefinitions : undefined,
          temperature: options.definition.llm.temperature,
          maxTokens: options.definition.llm.maxTokens,
          onChunk: (chunk) => {
            if (chunk.type === "thinking_delta") {
              currentStepThinking += chunk.thinkingDelta;
            }
            onChunk?.(chunk);
          },
          signal,
        }),
      LLM_RETRY_ATTEMPTS,
    );

    totalPromptTokens += response.usage.promptTokens;
    totalCompletionTokens += response.usage.completionTokens;

    const assistantMessage: ChatMessage = {
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls.length > 0 ? response.toolCalls : undefined,
    };
    contextManager.push(assistantMessage);

    if (response.toolCalls.length === 0) {
      correctionCount += 1;

      if (hasFinishTool && correctionCount <= maxCorrectionAttempts) {
        onCorrectionRetry?.();
        contextManager.push({
          role: "user",
          content: CORRECTION_PROMPT,
        });
        stepIndex -= 1;
        continue;
      }

      finalMessage = response.content;
      const fallbackStep: AgentStep = {
        index: stepIndex,
        thought: response.content,
        thinkingText: currentStepThinking || null,
        toolCalls: [],
        isFinish: true,
      };
      steps.push(fallbackStep);
      onStep?.(fallbackStep);
      finishReason = "implicit_completion";
      break;
    }

    correctionCount = 0;

    // oxlint-disable-next-line no-await-in-loop -- ReAct loop steps must be sequential
    const toolCallRecords: ToolCallRecord[] = await executeToolCalls(
      response.toolCalls,
      toolMap,
      { traceId, sessionId, signal },
      maxConcurrent,
      {
        onToolConfirmRequest,
        onToolExecuteRequest,
        sessionTrustPolicy,
        trustedToolNames,
      },
    );

    const toolMessages: ChatMessage[] = toolCallRecords.map((tc) => ({
      role: "tool" as const,
      content: tc.error ? `Error: ${tc.error}` : JSON.stringify(tc.result),
      toolCallId: tc.id,
    }));
    contextManager.pushMany(toolMessages);

    const finishToolCall = toolCallRecords.find(
      (tc) => !tc.error && toolMap.get(tc.toolName)?.isFinishTool,
    );

    const step: AgentStep = {
      index: stepIndex,
      thought: response.content,
      thinkingText: currentStepThinking || null,
      toolCalls: toolCallRecords,
      isFinish: !!finishToolCall,
    };
    steps.push(step);
    onStep?.(step);

    if (finishToolCall) {
      const args = finishToolCall.arguments;
      finalMessage =
        response.content && response.content.trim().length > 0
          ? response.content
          : typeof args.message === "string"
            ? args.message
            : null;
      finishReason = "completed";
      break;
    }

    try {
      // oxlint-disable-next-line no-await-in-loop -- summarization must happen between steps
      await contextManager.maybeSummarize(llmProvider, signal);
    } catch {
      // ignore summarize errors
    }
  }

  return {
    steps,
    finalMessage,
    usage: {
      totalPromptTokens,
      totalCompletionTokens,
    },
    finishReason,
  };
};

type ToolConfirmCtx = {
  onToolConfirmRequest: AgentRunOptions["onToolConfirmRequest"];
  onToolExecuteRequest: AgentRunOptions["onToolExecuteRequest"];
  sessionTrustPolicy: "confirm_all" | "trust_session";
  trustedToolNames: Set<string>;
};

const executeToolCalls = async (
  toolCalls: { id: string; name: string; arguments: string }[],
  toolMap: Map<string, AgentToolDefinition>,
  ctx: { traceId: string; sessionId: string; signal?: AbortSignal },
  maxConcurrent: number,
  confirmCtx: ToolConfirmCtx,
): Promise<ToolCallRecord[]> => {
  const results: ToolCallRecord[] = [];

  for (let i = 0; i < toolCalls.length; i += maxConcurrent) {
    const batch = toolCalls.slice(i, i + maxConcurrent);
    // oxlint-disable-next-line no-await-in-loop -- batches must be sequential, within-batch is parallel
    const batchResults = await Promise.all(
      batch.map(async (tc) =>
        executeSingleToolCall(tc, toolMap, ctx, confirmCtx),
      ),
    );
    results.push(...batchResults);
  }

  return results;
};

const needsConfirmation = (
  policy: ToolConfirmationPolicy | undefined,
  sessionPolicy: "confirm_all" | "trust_session",
  trustedToolNames: Set<string>,
  toolName: string,
): boolean => {
  const effectivePolicy = policy ?? "auto_allow";
  if (effectivePolicy === "auto_allow") return false;
  if (effectivePolicy === "always_confirm") return true;
  if (trustedToolNames.has(toolName)) return false;
  return sessionPolicy === "confirm_all";
};

const policyToRiskLevel = (
  policy: ToolConfirmationPolicy | undefined,
): "low" | "medium" | "high" => {
  if (policy === "always_confirm") return "high";
  if (policy === "session_trust") return "medium";
  return "low";
};

const executeSingleToolCall = async (
  toolCall: { id: string; name: string; arguments: string },
  toolMap: Map<string, AgentToolDefinition>,
  ctx: { traceId: string; sessionId: string; signal?: AbortSignal },
  confirmCtx: ToolConfirmCtx,
): Promise<ToolCallRecord> => {
  const start = Date.now();
  const tool = toolMap.get(toolCall.name);

  if (!tool) {
    return {
      id: toolCall.id,
      toolName: toolCall.name,
      arguments: {},
      result: null,
      error: `Unknown tool: ${toolCall.name}`,
      durationMs: Date.now() - start,
      target: "server",
      confirmationStatus: null,
    };
  }

  const toolTarget = tool.target ?? "server";

  let parsedArgs: Record<string, unknown> = {};
  try {
    // oxlint-disable-next-line no-unsafe-type-assertion -- JSON.parse returns unknown, narrowing to Record is safe here
    parsedArgs = JSON.parse(toolCall.arguments) as Record<string, unknown>;
  } catch {
    return {
      id: toolCall.id,
      toolName: toolCall.name,
      arguments: {},
      result: null,
      error: `Failed to parse tool arguments: ${toolCall.arguments}`,
      durationMs: Date.now() - start,
      target: toolTarget,
      confirmationStatus: null,
    };
  }

  let confirmationStatus: ToolCallRecord["confirmationStatus"] = "auto_allowed";

  if (
    needsConfirmation(
      tool.confirmationPolicy,
      confirmCtx.sessionTrustPolicy,
      confirmCtx.trustedToolNames,
      tool.name,
    )
  ) {
    if (!confirmCtx.onToolConfirmRequest) {
      confirmationStatus = "auto_allowed";
    } else {
      const response = await confirmCtx.onToolConfirmRequest({
        callId: toolCall.id,
        toolName: tool.name,
        description: tool.description,
        arguments: parsedArgs,
        riskLevel: policyToRiskLevel(tool.confirmationPolicy),
      });

      if (response.decision === "deny") {
        return {
          id: toolCall.id,
          toolName: toolCall.name,
          arguments: parsedArgs,
          result: null,
          error: "User denied tool execution",
          durationMs: Date.now() - start,
          target: toolTarget,
          confirmationStatus: "user_denied",
        };
      }

      confirmationStatus = "user_approved";

      if (response.decision === "trust_tool_for_session") {
        confirmCtx.trustedToolNames.add(tool.name);
      } else if (response.decision === "trust_all_for_session") {
        confirmCtx.sessionTrustPolicy = "trust_session";
      }
    }
  }

  if (toolTarget === "client") {
    if (!confirmCtx.onToolExecuteRequest) {
      return {
        id: toolCall.id,
        toolName: toolCall.name,
        arguments: parsedArgs,
        result: null,
        error: `Client tool "${tool.name}" cannot be executed: no frontend handler connected`,
        durationMs: Date.now() - start,
        target: "client",
        confirmationStatus,
      };
    }

    try {
      const validated = tool.parameters.parse(parsedArgs);
      const response = await confirmCtx.onToolExecuteRequest({
        callId: toolCall.id,
        toolName: tool.name,
        arguments: validated,
      });

      if (response.error) {
        return {
          id: toolCall.id,
          toolName: toolCall.name,
          arguments: parsedArgs,
          result: null,
          error: response.error,
          durationMs: Date.now() - start,
          target: "client",
          confirmationStatus,
        };
      }

      return {
        id: toolCall.id,
        toolName: toolCall.name,
        arguments: parsedArgs,
        result: response.result ?? null,
        error: null,
        durationMs: Date.now() - start,
        target: "client",
        confirmationStatus,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      return {
        id: toolCall.id,
        toolName: toolCall.name,
        arguments: parsedArgs,
        result: null,
        error: errorMessage,
        durationMs: Date.now() - start,
        target: "client",
        confirmationStatus,
      };
    }
  }

  try {
    const validatedArgs = tool.parameters.parse(parsedArgs);
    const effectiveTimeout = tool.timeoutMs ?? TOOL_CALL_TIMEOUT_MS;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        reject(new Error(`Tool call timed out after ${effectiveTimeout}ms`));
      }, effectiveTimeout),
    );
    const result = await Promise.race([
      tool.execute(validatedArgs, ctx),
      timeoutPromise,
    ]);
    return {
      id: toolCall.id,
      toolName: toolCall.name,
      arguments: parsedArgs,
      result,
      error: null,
      durationMs: Date.now() - start,
      target: "server",
      confirmationStatus,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      id: toolCall.id,
      toolName: toolCall.name,
      arguments: parsedArgs,
      result: null,
      error: errorMessage,
      durationMs: Date.now() - start,
      target: toolTarget,
      confirmationStatus,
    };
  }
};

const callLLMWithRetry = async <T>(
  fn: () => Promise<T>,
  maxAttempts: number,
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      // oxlint-disable-next-line no-await-in-loop -- retry loop is inherently sequential
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts - 1) {
        const delay = LLM_RETRY_BASE_MS * 2 ** attempt;
        // oxlint-disable-next-line no-await-in-loop -- backoff delay must be sequential
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
};
