import type {
  AgentBlackboardData,
  AgentNodeContext,
} from "../agent-dag-builder.ts";

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * @zh DecisionNode 路由决策结果。
 * @en DecisionNode routing decision result.
 */
export type DecisionOutcome =
  | { shouldContinue: true }
  | {
      shouldContinue: false;
      reason: "finish" | "maxTurns" | "timeout";
    };

// ─── DecisionNode ─────────────────────────────────────────────────────────────

/**
 * @zh DecisionNode：根据 Blackboard 状态决定 DAG 循环是否继续。
 *
 * 路由优先级（由高到低）:
 * 1. finish 工具被调用 → 路由到完成
 * 2. maxTurns 耗尽 → 路由到失败
 * 3. 超时 → 路由到失败
 * 4. 否则 → 路由回 PreCheck 继续循环
 *
 * @en DecisionNode: decides whether the DAG loop should continue based on Blackboard state.
 *
 * Routing priority (high to low):
 * 1. finish tool was called → route to completion
 * 2. maxTurns exhausted → route to failure
 * 3. timeout exceeded → route to failure
 * 4. otherwise → route back to PreCheck to continue loop
 *
 * @param data - {@zh 当前 Blackboard 数据} {@en Current Blackboard data}
 * @param ctx - {@zh Agent 节点上下文} {@en Agent node context}
 * @returns - {@zh DecisionOutcome} {@en DecisionOutcome}
 */
export const runDecisionNode = (
  data: AgentBlackboardData,
  ctx: Pick<AgentNodeContext, "constraints" | "startedAt" | "logger">,
): DecisionOutcome => {
  const { constraints, startedAt, logger } = ctx;

  logger.logDAGNode({
    nodeType: "decision",
    status: "started",
    message: "DecisionNode: evaluating routing",
  });

  // Highest priority: finish tool was called
  if (data.finish_called) {
    logger.logDAGNode({
      nodeType: "decision",
      status: "completed",
      message: "DecisionNode: finish called → completing",
    });
    return { shouldContinue: false, reason: "finish" };
  }

  // Check maxTurns using current_turn (already incremented by PreCheckNode)
  const currentTurn = data.current_turn ?? 0;
  if (currentTurn >= constraints.maxSteps) {
    logger.logDAGNode({
      nodeType: "decision",
      status: "completed",
      message: `DecisionNode: maxTurns=${constraints.maxSteps} reached`,
    });
    return { shouldContinue: false, reason: "maxTurns" };
  }

  // Check timeout
  const elapsedMs = Date.now() - startedAt.getTime();
  if (elapsedMs >= constraints.timeoutMs) {
    logger.logDAGNode({
      nodeType: "decision",
      status: "completed",
      message: "DecisionNode: timeout exceeded",
    });
    return { shouldContinue: false, reason: "timeout" };
  }

  logger.logDAGNode({
    nodeType: "decision",
    status: "completed",
    message: "DecisionNode: continue loop",
  });

  return { shouldContinue: true };
};
