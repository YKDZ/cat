import type { AgentConstraints } from "@cat/shared";

// ─── ErrorRecovery Budget Snapshot ───────────────────────────────────────────

/**
 * Error recovery budget snapshot, used to persist current budget consumption.
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
 * Error recovery budget manager: independently tracks truncation, context overflow, and total turns.
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
   * Consume one truncation budget. Returns whether budget remains.
   *
   * @returns - true if budget remains; false if exhausted
   */
  consumeTruncation(): boolean {
    if (this.truncationUsed >= this.truncationMax) {
      return false;
    }
    this.truncationUsed += 1;
    return true;
  }

  /**
   * Consume one context overflow budget. Returns whether budget remains.
   */
  consumeContextOverflow(): boolean {
    if (this.contextOverflowUsed >= this.contextOverflowMax) {
      return false;
    }
    this.contextOverflowUsed += 1;
    return true;
  }

  /**
   * Consume one turn (called by DecisionNode in each DAG loop iteration).
   */
  consumeTurn(): void {
    this.turnsUsed += 1;
  }

  /**
   * Whether the agent run should be terminated (any budget exceeded triggers termination).
   */
  shouldTerminate(): boolean {
    return this.turnsUsed >= this.maxTurns;
  }

  /**
   * Get current budget consumption snapshot.
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
