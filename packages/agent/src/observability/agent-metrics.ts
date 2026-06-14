// ─── Metrics Snapshot ─────────────────────────────────────────────────────────

/**
 * Agent metrics snapshot with counters and distribution data.
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
 * Agent basic metrics collector (in-memory implementation, Phase 0a).
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
   * Record token usage (M01).
   */
  recordTokens(prompt: number, completion: number): void {
    this.promptTokens += prompt;
    this.completionTokens += completion;
  }

  /**
   * Record DAG node execution duration (M02).
   *
   * @param nodeType - Node type
   * @param durationMs - Execution duration (ms)
   */
  recordNodeDuration(nodeType: string, durationMs: number): void {
    if (!this.nodeDurations[nodeType]) {
      this.nodeDurations[nodeType] = [];
    }
    this.nodeDurations[nodeType].push(durationMs);
  }

  /**
   * Record tool call count (M03).
   *
   * @param toolName - Tool name
   */
  recordToolCall(toolName: string): void {
    this.toolCalls[toolName] = (this.toolCalls[toolName] ?? 0) + 1;
  }

  /**
   * Record error count (M04).
   *
   * @param category - Error category
   */
  recordError(category: string): void {
    this.errors[category] = (this.errors[category] ?? 0) + 1;
  }

  /**
   * Record ChangeSet creation (M05).
   */
  recordChangesetCreated(): void {
    this.changesetCreatedCount += 1;
  }

  /**
   * Record ChangeSet entry count by entityType (M06).
   *
   * @param entityType - Entity type
   */
  recordChangesetEntry(entityType: string): void {
    this.changesetEntryByType[entityType] =
      (this.changesetEntryByType[entityType] ?? 0) + 1;
  }

  /**
   * Record OCC conflict count (M07).
   */
  recordOCCConflict(): void {
    this.occConflictCount += 1;
  }

  /**
   * Get current metrics snapshot.
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
