import type {
  AgentBlackboardData,
  AgentNodeContext,
} from "../agent-dag-builder.ts";

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * @zh PreCheckNode 执行结果。
 * @en PreCheckNode execution result.
 */
export interface PreCheckResult {
  /**
   * @zh 是否需要强制终止（步数或超时超限）
   * @en Whether to force abort (step count or timeout exceeded)
   */
  shouldAbort: boolean;
  /** @zh 终止原因 @en Abort reason */
  abortReason?: "maxTurns" | "timeout";
  /**
   * @zh 写入 Blackboard 的提示信息
   * @en Notes to write to Blackboard
   */
  precheckNotes: string;
  /** @zh 写入 Blackboard data 的更新 @en Updates to write to Blackboard data */
  updates: Partial<AgentBlackboardData>;
}

// ─── PreCheckNode ─────────────────────────────────────────────────────────────

/**
 * @zh PreCheckNode（Phase 0a 简化版）：步数/超时检查 + Blackboard 更新。
 *
 * 在 Phase 0a 中，PreCheck 仅执行基础的步数和超时边界检查，
 * 并将进度信息写入 `precheck_notes` 字段以供 ReasoningNode 使用。
 *
 * @en PreCheckNode (Phase 0a simplified): step/timeout check + Blackboard update.
 *
 * In Phase 0a, PreCheck only performs basic step count and timeout boundary checks,
 * and writes progress info to `precheck_notes` for ReasoningNode to use.
 *
 * @param data - {@zh 当前 Blackboard 数据} {@en Current Blackboard data}
 * @param ctx - {@zh Agent 节点上下文} {@en Agent node context}
 * @returns - {@zh PreCheckResult} {@en PreCheckResult}
 */
export const runPreCheckNode = (
  data: AgentBlackboardData,
  ctx: Pick<AgentNodeContext, "constraints" | "startedAt" | "logger">,
): PreCheckResult => {
  const { constraints, startedAt, logger } = ctx;

  const currentTurn = data.current_turn ?? 0;
  const elapsedMs = Date.now() - startedAt.getTime();

  logger.logDAGNode({
    nodeType: "precheck",
    status: "started",
    message: `PreCheck: turn=${currentTurn}, elapsed=${Math.round(elapsedMs / 1000)}s`,
  });

  // Check maxTurns
  if (currentTurn >= constraints.maxSteps) {
    logger.logDAGNode({
      nodeType: "precheck",
      status: "completed",
      message: "PreCheck: maxTurns exceeded",
    });
    return {
      shouldAbort: true,
      abortReason: "maxTurns",
      precheckNotes: "",
      updates: {},
    };
  }

  // Check timeout
  if (elapsedMs >= constraints.timeoutMs) {
    logger.logDAGNode({
      nodeType: "precheck",
      status: "completed",
      message: "PreCheck: timeout exceeded",
    });
    return {
      shouldAbort: true,
      abortReason: "timeout",
      precheckNotes: "",
      updates: {},
    };
  }

  const precheckNotes = [
    `Turn: ${currentTurn + 1} / ${constraints.maxSteps}`,
    `Elapsed: ${Math.round(elapsedMs / 1000)}s / ${Math.round(constraints.timeoutMs / 1000)}s`,
  ].join("\n");

  logger.logDAGNode({
    nodeType: "precheck",
    status: "completed",
    message: "PreCheck: OK",
  });

  return {
    shouldAbort: false,
    precheckNotes,
    updates: {
      precheck_notes: precheckNotes,
      current_turn: currentTurn + 1,
    },
  };
};
