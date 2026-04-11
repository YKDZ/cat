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

// ─── Services ─────────────────────────────────────────────────────────────────

/**
 * @zh PreCheckNode 可选服务接口。
 * @en Optional services available to PreCheckNode.
 */
export interface PreCheckServices {
  /**
   * @zh 检查 Kanban 卡片的 DAG 依赖就绪状态。
   * @en Check whether Kanban card DAG dependencies are satisfied.
   */
  checkKanbanDeps?: (
    cardId: string,
  ) => Promise<{ allMet: boolean; blocking: string[] }>;
}

// ─── Context Extension ────────────────────────────────────────────────────────

export type PreCheckContext = Pick<
  AgentNodeContext,
  "constraints" | "startedAt" | "logger" | "sessionId"
> & { services?: PreCheckServices };

// ─── PreCheckNode ─────────────────────────────────────────────────────────────

/**
 * @zh PreCheckNode（Phase 0b）：步数/超时检查 + Kanban DAG 依赖检查 + Blackboard 更新。
 * @en PreCheckNode (Phase 0b): step/timeout check + Kanban DAG dependency check + Blackboard update.
 */
export const runPreCheckNode = async (
  data: AgentBlackboardData,
  ctx: PreCheckContext,
): Promise<PreCheckResult> => {
  const { constraints, startedAt, logger, services } = ctx;

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

  const notes: string[] = [
    `Turn: ${currentTurn + 1} / ${constraints.maxSteps}`,
    `Elapsed: ${Math.round(elapsedMs / 1000)}s / ${Math.round(constraints.timeoutMs / 1000)}s`,
  ];

  // Kanban DAG dependency check
  if (services?.checkKanbanDeps && data.current_card_id) {
    const depsResult = await services.checkKanbanDeps(data.current_card_id);
    if (!depsResult.allMet) {
      notes.push(
        `[WARN] Kanban 依赖未就绪 — 以下前置卡片 DONE 状态未达成: ${depsResult.blocking.join(", ")}`,
      );
    }
  }

  const precheckNotes = notes.join("\n");

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
