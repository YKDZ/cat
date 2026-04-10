// ─── Metrics Snapshot ─────────────────────────────────────────────────────────

/**
 * @zh Agent 指标快照，包含各项计数器和分布数据。
 * @en Agent metrics snapshot with counters and distribution data.
 */
export interface AgentMetricsSnapshot {
  /** M01: agent.tokens.total */
  totalTokens: { prompt: number; completion: number };
  /** M02: agent.dag.node.duration (ms) per node type */
  nodeDurations: Record<string, number[]>;
  /** M03: agent.tool.calls per tool name */
  toolCalls: Record<string, number>;
  /** M04: agent.errors per category */
  errors: Record<string, number>;
  /** M05: team.kanban.throughput (cards completed) */
  kanbanThroughput: number;
}

// ─── AgentMetrics ─────────────────────────────────────────────────────────────

/**
 * @zh Agent 基础指标收集器（纯内存实现，Phase 0a 版）。
 * @en Agent basic metrics collector (in-memory implementation, Phase 0a).
 */
export class AgentMetrics {
  private promptTokens = 0;
  private completionTokens = 0;
  private readonly nodeDurations: Record<string, number[]> = {};
  private readonly toolCalls: Record<string, number> = {};
  private readonly errors: Record<string, number> = {};
  private kanbanThroughput = 0;

  /**
   * @zh 记录 token 用量（M01）。
   * @en Record token usage (M01).
   */
  recordTokens(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
  }

  /**
   * @zh 记录 DAG 节点执行耗时（M02）。
   * @en Record DAG node execution duration (M02).
   *
   * @param nodeType - {@zh 节点类型} {@en Node type}
   * @param durationMs - {@zh 执行耗时（ms）} {@en Execution duration (ms)}
   */
  recordNodeDuration(nodeType: string, durationMs: number): void {
    if (!this.nodeDurations[nodeType]) {
      this.nodeDurations[nodeType] = [];
    }
    this.nodeDurations[nodeType].push(durationMs);
  }

  /**
   * @zh 记录工具调用次数（M03）。
   * @en Record tool call count (M03).
   *
   * @param toolName - {@zh 工具名称} {@en Tool name}
   */
  recordToolCall(toolName: string): void {
    this.toolCalls[toolName] = (this.toolCalls[toolName] ?? 0) + 1;
  }

  /**
   * @zh 记录错误次数（M04）。
   * @en Record error count (M04).
   *
   * @param category - {@zh 错误类别} {@en Error category}
   */
  recordError(category: string): void {
    this.errors[category] = (this.errors[category] ?? 0) + 1;
  }

  /**
   * @zh 记录 Kanban 卡片完成（M05）。
   * @en Record kanban card completion (M05).
   */
  recordKanbanCardCompleted(): void {
    this.kanbanThroughput += 1;
  }

  /**
   * @zh 获取当前指标快照。
   * @en Get current metrics snapshot.
   */
  snapshot(): AgentMetricsSnapshot {
    return {
      totalTokens: {
        prompt: this.promptTokens,
        completion: this.completionTokens,
      },
      nodeDurations: structuredClone(this.nodeDurations),
      toolCalls: structuredClone(this.toolCalls),
      errors: structuredClone(this.errors),
      kanbanThroughput: this.kanbanThroughput,
    };
  }
}
