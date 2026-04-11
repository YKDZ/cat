import type { AgentConstraints } from "@cat/shared/schema/agent";

import { Blackboard, buildPatch } from "@cat/graph";

import type {
  AgentBlackboardData,
  AgentNodeContext,
} from "../dag/agent-dag-builder.ts";
import type { LLMGateway } from "../llm/llm-gateway.ts";
import type { AgentLogger } from "../observability/agent-logger.ts";
import type { ToolRegistry } from "../tool/tool-registry.ts";
import type {
  CreateSessionParams,
  CreateSessionResult,
} from "./session-manager.ts";

import { runDecisionNode } from "../dag/nodes/decision-node.ts";
import {
  runPreCheckNode,
  type PreCheckServices,
} from "../dag/nodes/precheck-node.ts";
import { runReasoningNode } from "../dag/nodes/reasoning-node.ts";
import { runToolNode } from "../dag/nodes/tool-node.ts";
import { createNoopAgentLogger } from "../observability/agent-logger.ts";
import { AgentMetrics } from "../observability/agent-metrics.ts";
import {
  CompressionPipeline,
  type CompressionConfig,
} from "../prompt/compression-pipeline.ts";
import { PromptEngine } from "../prompt/prompt-engine.ts";
import { estimateTokens } from "../prompt/token-estimator.ts";
import { AsyncIterableChannel } from "./async-iterable-channel.ts";
import { ErrorRecoveryManager } from "./error-recovery.ts";
import { buildPromptVariables } from "./prompt-variables.ts";
import { SessionManager } from "./session-manager.ts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * @zh 判断错误是否为 LLM context 超出错误。
 * @en Check whether the error is a context-length exceeded error from the LLM.
 */
function isContextOverflowError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  if (
    msg.includes("context_length_exceeded") ||
    msg.includes("context window") ||
    msg.includes("maximum context length") ||
    msg.includes("tokens exceeds")
  ) {
    return true;
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const code = (err as { code?: unknown }).code;
  return code === "context_length_exceeded";
}

/** @zh 默认压缩管线配置。@en Default compression pipeline configuration. */
const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  toolResultBudget: 2000,
  contextWindowRatio: 0.8,
  contextWindowSize: 128_000,
};

// ─── Agent Events ─────────────────────────────────────────────────────────────

/**
 * @zh AgentRuntime.runLoop() 发出的事件联合类型。
 * @en Union type of events emitted by AgentRuntime.runLoop().
 */
export type AgentEvent =
  | { type: "started"; runId: string; sessionId: string }
  | {
      type: "node";
      nodeType: "precheck" | "reasoning" | "tool" | "decision";
      status: "started" | "completed" | "failed";
    }
  | { type: "token_delta"; textDelta: string }
  | { type: "tool_call"; toolName: string; toolCallId: string }
  | { type: "tool_result"; toolCallId: string; content: string }
  | { type: "llm_thinking"; thinkingDelta: string }
  | {
      type: "llm_complete";
      text: string;
      thinkingText: string;
      tokenUsage: { promptTokens: number; completionTokens: number };
    }
  | {
      type: "finished";
      reason: "finish" | "maxTurns" | "timeout";
      runId: string;
      sessionId: string;
    }
  | { type: "failed"; error: Error; runId: string; sessionId: string };

// ─── AgentRuntime Config ──────────────────────────────────────────────────────

/**
 * @zh AgentRuntime 初始化配置。
 * @en AgentRuntime initialization configuration.
 */
export interface AgentRuntimeConfig {
  /** @zh LLM 调用网关 @en LLM call gateway */
  llmGateway: LLMGateway;
  /** @zh 工具注册表 @en Tool registry */
  toolRegistry: ToolRegistry;
  /** @zh Prompt 引擎 @en Prompt engine */
  promptEngine?: PromptEngine;
  /** @zh 结构化日志 @en Structured logger */
  logger?: AgentLogger;
  /** @zh PreCheck 使用的可选服务集合 @en Optional services used by PreCheck */
  preCheckServices?: PreCheckServices;
}

// ─── AgentRuntime ─────────────────────────────────────────────────────────────

/**
 * @zh AgentRuntime：顶层 Agent DAG 循环控制器。
 *
 * 职责:
 * - 启动/恢复 Session（委托给 SessionManager）
 * - 运行 PreCheck → Reasoning → Tool → Decision 循环
 * - 以 AsyncIterable<AgentEvent> 形式发出事件
 * - 持久化 Blackboard 快照
 * - 完成时更新 Session 状态
 *
 * @en AgentRuntime: top-level Agent DAG loop controller.
 *
 * Responsibilities:
 * - Start/resume sessions (delegated to SessionManager)
 * - Run PreCheck → Reasoning → Tool → Decision loop
 * - Emit events as AsyncIterable<AgentEvent>
 * - Persist Blackboard snapshots
 * - Update session status on completion
 */
export class AgentRuntime {
  private readonly config: AgentRuntimeConfig;
  private readonly sessionManager: SessionManager;
  private readonly logger: AgentLogger;

  constructor(config: AgentRuntimeConfig) {
    this.config = config;
    this.sessionManager = new SessionManager();
    this.logger = config.logger ?? createNoopAgentLogger();
  }

  /**
   * @zh 启动新的 Agent Session 并返回 Session/Run ID。
   * @en Start a new Agent Session and return Session/Run IDs.
   *
   * @param params - {@zh 会话创建参数} {@en Session creation parameters}
   * @returns - {@zh Session ID 和 Run ID} {@en Session ID and Run ID}
   */
  async startSession(
    params: CreateSessionParams,
  ): Promise<CreateSessionResult> {
    return this.sessionManager.createSession(params);
  }

  /**
   * @zh 运行 Agent DAG 循环，以 AsyncIterable<AgentEvent> 流式发出事件。
   *
   * 调用者负责消费事件流（例如通过 for await of 获取 token_delta 实时渲染）。
   *
   * @en Run the Agent DAG loop, emitting events as AsyncIterable<AgentEvent>.
   *
   * Callers are responsible for consuming the event stream
   * (e.g. using for-await-of to render token_delta in real time).
   *
   * @param sessionId - {@zh agentSession 外部 UUID} {@en agentSession external UUID}
   * @param runId - {@zh agentRun 外部 UUID} {@en agentRun external UUID}
   */
  async *runLoop(sessionId: string, runId: string): AsyncIterable<AgentEvent> {
    // Load session state
    const state = await this.sessionManager.loadSession(sessionId, runId);
    const { agentDefinition, blackboardSnapshot } = state;

    const constraints: AgentConstraints = agentDefinition.metadata
      .constraints ?? {
      maxSteps: 50,
      maxConcurrentToolCalls: 3,
      timeoutMs: 600_000,
      maxCorrectionAttempts: 2,
    };

    // Initialize Blackboard
    const startedAt = new Date();
    const initialData: AgentBlackboardData = blackboardSnapshot
      ? blackboardSnapshot.data
      : {
          messages: [],
          current_turn: 0,
          started_at: startedAt.toISOString(),
        };

    const blackboard = blackboardSnapshot
      ? Blackboard.fromSnapshot(blackboardSnapshot)
      : new Blackboard({
          runId,
          // oxlint-disable-next-line no-unsafe-type-assertion -- structural cast required for Blackboard API
          initialData: initialData as unknown as Record<string, unknown>,
        });

    // Error recovery, metrics, and compression
    const errorRecovery = new ErrorRecoveryManager(constraints);
    const metrics = new AgentMetrics();
    const compressionPipeline = new CompressionPipeline(
      DEFAULT_COMPRESSION_CONFIG,
    );

    // Build node context (shared)
    const promptEngine =
      this.config.promptEngine ??
      new (
        await import("../prompt/prompt-engine.ts").then((m) => m.PromptEngine)
      )();

    const nodeCtx: AgentNodeContext = {
      sessionId,
      runId,
      agentId: agentDefinition.metadata.id,
      projectId: state.projectId ?? state.sessionMetadata?.projectId ?? "",
      sessionMetadata: state.sessionMetadata,
      promptVariables: buildPromptVariables({
        constraints,
        metadata: state.sessionMetadata,
      }),
      llmGateway: this.config.llmGateway,
      toolRegistry: this.config.toolRegistry,
      promptEngine,
      constraints,
      startedAt,
      logger: this.logger,
    };

    this.logger.logRun({
      runId,
      sessionId,
      status: "started",
      message: `AgentRuntime: starting run for session=${sessionId}`,
    });

    yield { type: "started", runId, sessionId };

    const getCurrentData = (): AgentBlackboardData => {
      const snap = blackboard.getSnapshot();
      // oxlint-disable-next-line no-unsafe-type-assertion -- structural cast required for Blackboard API
      return snap.data as unknown as AgentBlackboardData;
    };

    const applyUpdates = (updates: Partial<AgentBlackboardData>): void => {
      const snap = blackboard.getSnapshot();
      const patch = buildPatch({
        actorId: "agent-runtime",
        parentSnapshotVersion: snap.version,
        // oxlint-disable-next-line no-unsafe-type-assertion -- structural cast required for Blackboard API
        updates: updates as unknown as Record<string, unknown>,
      });
      blackboard.applyPatch(patch);
    };

    try {
      // DAG loop
      while (true) {
        // ── PreCheck ─────────────────────────────────────────────────────────
        yield { type: "node", nodeType: "precheck", status: "started" };
        // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: must complete before reasoning
        const preCheckResult = await runPreCheckNode(getCurrentData(), {
          ...nodeCtx,
          services: this.config.preCheckServices,
        });

        if (preCheckResult.shouldAbort) {
          const reason = preCheckResult.abortReason ?? "maxTurns";
          this.logger.logRun({
            runId,
            sessionId,
            status: "failed",
            message: `AgentRuntime: aborted by PreCheck (${reason})`,
          });
          yield { type: "node", nodeType: "precheck", status: "completed" };
          yield {
            type: "finished",
            reason: reason,
            runId,
            sessionId,
          };
          // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: must complete before returning
          await this.sessionManager.completeSession(sessionId, runId, "FAILED");
          return;
        }

        applyUpdates(preCheckResult.updates);
        yield { type: "node", nodeType: "precheck", status: "completed" };

        // ── Reasoning ─────────────────────────────────────────────────────────
        yield { type: "node", nodeType: "reasoning", status: "started" };

        // Create a channel for real-time thinking delta forwarding
        const thinkingChannel = new AsyncIterableChannel<string>();

        // oxlint-disable-next-line no-unsafe-type-assertion -- AgentBlackboardData.messages is structurally ChatMessage[]
        let reasoningResult!: Awaited<ReturnType<typeof runReasoningNode>>;

        try {
          const nodeCtxWithEmit: AgentNodeContext = {
            ...nodeCtx,
            emitEvent: (event) => {
              if (
                event.type === "llm:thinking" &&
                typeof event.payload.thinkingDelta === "string"
              ) {
                thinkingChannel.push(event.payload.thinkingDelta);
              }
            },
          };

          // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: reasoning must complete before tools
          const reasoningPromise = runReasoningNode(
            getCurrentData(),
            nodeCtxWithEmit,
            agentDefinition,
          ).then((result) => {
            thinkingChannel.close();
            return result;
          });

          // Interleave: yield llm_thinking events from channel while reasoning runs
          const channelIter = thinkingChannel[Symbol.asyncIterator]();
          let partialResult: Awaited<typeof reasoningPromise> | undefined;

          while (!partialResult) {
            const channelNextPromise = channelIter.next();
            // oxlint-disable-next-line no-await-in-loop -- interleaving channel and reasoning result
            const winner = await Promise.race([
              channelNextPromise.then((v) => ({
                source: "channel" as const,
                value: v,
              })),
              reasoningPromise.then((r) => ({
                source: "done" as const,
                result: r,
              })),
            ]);

            if (winner.source === "channel") {
              if (!winner.value.done) {
                yield {
                  type: "llm_thinking",
                  thinkingDelta: winner.value.value,
                };
              }
            } else {
              partialResult = winner.result;
              // Drain any remaining channel events
              // oxlint-disable-next-line no-await-in-loop
              for await (const remaining of {
                [Symbol.asyncIterator]: () => channelIter,
              }) {
                yield { type: "llm_thinking", thinkingDelta: remaining };
              }
            }
          }

          reasoningResult = partialResult;
        } catch (innerErr) {
          thinkingChannel.close();
          if (
            isContextOverflowError(innerErr) &&
            errorRecovery.consumeContextOverflow()
          ) {
            const currentData = getCurrentData();
            // oxlint-disable-next-line no-unsafe-type-assertion -- AgentBlackboardData.messages is structurally ChatMessage[]
            const compressed = compressionPipeline.compress(
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion
              currentData.messages as unknown as Parameters<
                typeof compressionPipeline.compress
              >[0],
              estimateTokens,
            );
            // oxlint-disable-next-line no-unsafe-type-assertion -- compressed messages retain the same structure
            applyUpdates({
              messages:
                // oxlint-disable-next-line typescript/no-unsafe-type-assertion
                compressed.messages as unknown as AgentBlackboardData["messages"],
            });
            this.logger.logError({
              error:
                innerErr instanceof Error
                  ? innerErr
                  : new Error(String(innerErr)),
              nodeType: "reasoning",
              message: `Context overflow recovered: compressed ${compressed.stats.removedTokens} tokens; retrying turn`,
            });
            continue;
          }
          throw innerErr;
        }

        // Yield llm_complete event with full thinking text
        yield {
          type: "llm_complete",
          text: reasoningResult.text,
          thinkingText: reasoningResult.thinkingText,
          tokenUsage: reasoningResult.tokenUsage,
        };

        metrics.recordTokens(
          reasoningResult.tokenUsage.promptTokens,
          reasoningResult.tokenUsage.completionTokens,
        );
        applyUpdates(reasoningResult.updates);
        yield { type: "node", nodeType: "reasoning", status: "completed" };

        // Save snapshot after reasoning
        // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: snapshot must be saved before proceeding
        await this.sessionManager.saveSnapshot(
          runId,
          // oxlint-disable-next-line no-unsafe-type-assertion -- Blackboard snapshot data is structurally Record<string, unknown>
          blackboard.getSnapshot().data as Record<string, unknown>,
        );

        // ── Tool ─────────────────────────────────────────────────────────────
        if (reasoningResult.hasToolCalls) {
          yield { type: "node", nodeType: "tool", status: "started" };

          const data = getCurrentData();
          for (const tc of data.tool_calls ?? []) {
            yield { type: "tool_call", toolName: tc.name, toolCallId: tc.id };
          }

          // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: tool execution must complete before next reasoning turn
          const toolResult = await runToolNode(getCurrentData(), nodeCtx);

          for (const tr of toolResult.toolResults) {
            metrics.recordToolCall(
              data.tool_calls?.find((tc) => tc.id === tr.toolCallId)?.name ??
                "unknown",
            );
            yield {
              type: "tool_result",
              toolCallId: tr.toolCallId,
              content: tr.content,
            };
          }

          applyUpdates(toolResult.updates);
          yield { type: "node", nodeType: "tool", status: "completed" };

          // Save snapshot after tool execution
          // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: snapshot must be saved before next turn
          await this.sessionManager.saveSnapshot(
            runId,
            // oxlint-disable-next-line no-unsafe-type-assertion -- Blackboard snapshot data is structurally Record<string, unknown>
            blackboard.getSnapshot().data as Record<string, unknown>,
          );
        }

        // ── Decision ──────────────────────────────────────────────────────────
        yield { type: "node", nodeType: "decision", status: "started" };
        const decision = runDecisionNode(getCurrentData(), nodeCtx);
        errorRecovery.consumeTurn();
        yield { type: "node", nodeType: "decision", status: "completed" };

        if (!decision.shouldContinue) {
          const reason = decision.reason;
          this.logger.logRun({
            runId,
            sessionId,
            status: reason === "finish" ? "completed" : "failed",
            message: `AgentRuntime: run ended with reason=${reason}`,
          });
          yield { type: "finished", reason, runId, sessionId };
          // oxlint-disable-next-line no-await-in-loop -- sequential DAG step: must complete before returning
          await this.sessionManager.completeSession(
            sessionId,
            runId,
            reason === "finish" ? "COMPLETED" : "FAILED",
          );
          return;
        }

        // Continue loop — errorRecovery tracks turn usage but we rely
        // on PreCheckNode + DecisionNode for the actual maxTurns guard.
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.logger.logError({
        error: err,
        message: `AgentRuntime: unexpected error in runLoop`,
      });
      metrics.recordError("runtime");

      try {
        await this.sessionManager.saveSnapshot(
          runId,
          // oxlint-disable-next-line no-unsafe-type-assertion -- Blackboard snapshot data is structurally Record<string, unknown>
          blackboard.getSnapshot().data as Record<string, unknown>,
        );
        await this.sessionManager.completeSession(sessionId, runId, "FAILED");
      } catch {
        // best-effort
      }

      yield { type: "failed", error: err, runId, sessionId };
    }
  }
}

export type { CreateSessionParams, CreateSessionResult };
