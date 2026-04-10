import type { AgentConstraints } from "@cat/shared/schema/agent";

// ─── ErrorRecovery Budget Snapshot ───────────────────────────────────────────

/**
 * @zh 错误恢复预算快照，用于持久化当前预算消耗状态。
 * @en Error recovery budget snapshot, used to persist current budget consumption.
 */
export interface ErrorRecoveryBudget {
  truncationUsed: number;
  truncationMax: number;
  contextOverflowUsed: number;
  contextOverflowMax: number;
  turnsUsed: number;
  maxTurns: number;
}

// ─── ErrorRecoveryManager ────────────────────────────────────────────────────

/**
 * @zh 错误恢复预算管理器：独立追踪截断、上下文溢出和总轮次三类预算。
 * @en Error recovery budget manager: independently tracks truncation, context overflow, and total turns.
 */
export class ErrorRecoveryManager {
  private truncationUsed = 0;
  private contextOverflowUsed = 0;
  private turnsUsed = 0;

  private readonly truncationMax: number;
  private readonly contextOverflowMax: number;
  private readonly maxTurns: number;

  constructor(constraints: AgentConstraints) {
    this.truncationMax = constraints.errorRecovery?.truncationMax ?? 3;
    this.contextOverflowMax =
      constraints.errorRecovery?.contextOverflowMax ?? 2;
    this.maxTurns = constraints.maxSteps;
  }

  /**
   * @zh 消耗一次截断机会。返回是否还有剩余配额。
   * @en Consume one truncation budget. Returns whether budget remains.
   *
   * @returns - {@zh true 表示此次消耗成功（仍有剩余）；false 表示已超出上限} {@en true if budget remains; false if exhausted}
   */
  consumeTruncation(): boolean {
    if (this.truncationUsed >= this.truncationMax) {
      return false;
    }
    this.truncationUsed += 1;
    return true;
  }

  /**
   * @zh 消耗一次上下文溢出机会。返回是否还有剩余配额。
   * @en Consume one context overflow budget. Returns whether budget remains.
   */
  consumeContextOverflow(): boolean {
    if (this.contextOverflowUsed >= this.contextOverflowMax) {
      return false;
    }
    this.contextOverflowUsed += 1;
    return true;
  }

  /**
   * @zh 消耗一次轮次（由 DecisionNode 在每个 DAG 循环中调用）。
   * @en Consume one turn (called by DecisionNode in each DAG loop iteration).
   */
  consumeTurn(): void {
    this.turnsUsed += 1;
  }

  /**
   * @zh 判断 Agent 运行是否应当终止（任意上限超出即终止）。
   * @en Whether the agent run should be terminated (any budget exceeded triggers termination).
   */
  shouldTerminate(): boolean {
    return this.turnsUsed >= this.maxTurns;
  }

  /**
   * @zh 获取当前预算消耗快照。
   * @en Get current budget consumption snapshot.
   */
  snapshot(): ErrorRecoveryBudget {
    return {
      truncationUsed: this.truncationUsed,
      truncationMax: this.truncationMax,
      contextOverflowUsed: this.contextOverflowUsed,
      contextOverflowMax: this.contextOverflowMax,
      turnsUsed: this.turnsUsed,
      maxTurns: this.maxTurns,
    };
  }
}
