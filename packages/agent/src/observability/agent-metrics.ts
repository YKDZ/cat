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
  /** M05: vcs.changeset.created */
  changesetCreatedCount: number;
  /** M07: vcs.changeset.entry per entityType */
  changesetEntryByType: Record<string, number>;
  /** M08: vcs.occ.conflict */
  occConflictCount: number;
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
  private changesetCreatedCount = 0;
  private readonly changesetEntryByType: Record<string, number> = {};
  private occConflictCount = 0;

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
   * @zh 记录 ChangeSet 创建（M05）。
   * @en Record ChangeSet creation (M05).
   */
  recordChangesetCreated(): void {
    this.changesetCreatedCount += 1;
  }

  /**
   * @zh 记录 ChangeSet entry 按 entityType 计数（M06）。
   * @en Record ChangeSet entry count by entityType (M06).
   *
   * @param entityType - {@zh 实体类型} {@en Entity type}
   */
  recordChangesetEntry(entityType: string): void {
    this.changesetEntryByType[entityType] =
      (this.changesetEntryByType[entityType] ?? 0) + 1;
  }

  /**
   * @zh 记录 OCC 冲突次数（M07）。
   * @en Record OCC conflict count (M07).
   */
  recordOCCConflict(): void {
    this.occConflictCount += 1;
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
      changesetCreatedCount: this.changesetCreatedCount,
      changesetEntryByType: structuredClone(this.changesetEntryByType),
      occConflictCount: this.occConflictCount,
    };
  }
}
