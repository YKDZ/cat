import type {
  AgentBlackboardData,
  AgentNodeContext,
} from "../agent-dag-builder.ts";

// ─── Result ───────────────────────────────────────────────────────────────────

/**
 * PreCheckNode execution result.
 */
export interface PreCheckResult {
  /**
   * Whether to force abort (step count or timeout exceeded)
   */
  shouldAbort: boolean;
  /** Abort reason */
  abortReason?: "maxTurns" | "timeout";
  /**
   * Notes to write to Blackboard
   */
  precheckNotes: string;
  /** Updates to write to Blackboard data */
  updates: Partial<AgentBlackboardData>;
}

// ─── Services ─────────────────────────────────────────────────────────────────

/**
 * Optional services available to PreCheckNode.
 */
export type PreCheckServices = Record<string, never>;

// ─── Context Extension ────────────────────────────────────────────────────────

export type PreCheckContext = Pick<
  AgentNodeContext,
  "constraints" | "startedAt" | "logger" | "sessionId"
> & { services?: PreCheckServices };

// ─── PreCheckNode ─────────────────────────────────────────────────────────────

/**
 * PreCheckNode (Phase 0b): step/timeout check + Blackboard update.
 */
export const runPreCheckNode = async (
  data: AgentBlackboardData,
  ctx: PreCheckContext,
): Promise<PreCheckResult> => {
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

  const notes: string[] = [
    `Turn: ${currentTurn + 1} / ${constraints.maxSteps}`,
    `Elapsed: ${Math.round(elapsedMs / 1000)}s / ${Math.round(constraints.timeoutMs / 1000)}s`,
  ];

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
