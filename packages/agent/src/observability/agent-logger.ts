import type { Logger } from "@cat/shared";

// ─── Log Event Types ──────────────────────────────────────────────────────────

/**
 * L01: Agent run-level log event (run start/end).
 */
export interface AgentRunLogEvent {
  runId: string;
  sessionId: string;
  status: "started" | "completed" | "failed" | "cancelled";
  message: string;
  durationMs?: number;
  reason?: string;
}

/**
 * L02: DAG node log event (each node enter/exit).
 */
export interface AgentDAGNodeLogEvent {
  nodeType: "precheck" | "reasoning" | "tool" | "decision";
  status: "started" | "completed" | "failed";
  message: string;
  durationMs?: number;
  inputSnapshot?: Record<string, unknown>;
  outputSnapshot?: Record<string, unknown>;
}

/**
 * L03: LLM call log event.
 */
export interface AgentLLMCallLogEvent {
  providerId: string;
  modelName: string;
  promptTokens: number;
  completionTokens: number;
  durationMs: number;
  finishReason: string;
  message: string;
}

/**
 * L04: Tool execution log event.
 */
export interface AgentToolExecuteLogEvent {
  toolName: string;
  status: "started" | "completed" | "failed";
  durationMs?: number;
  message: string;
}

/**
 * L05: Agent error log event.
 */
export interface AgentErrorLogEvent {
  error: Error;
  nodeType?: string;
  message: string;
}

/**
 * L06: ChangeSet event log (created, reviewed, applied, rolled_back).
 */
export interface AgentChangeSetLogEvent {
  type:
    | "changeset.created"
    | "changeset.reviewed"
    | "changeset.applied"
    | "changeset.rolled_back";
  changesetId: string;
  agentRunId?: string;
  entryCount: number;
  status: string;
  summary?: string;
}

// ─── AgentLogger ──────────────────────────────────────────────────────────────────

/**
 * Agent structured logger interface.
 */
export interface AgentLogger {
  /** L01 */
  logRun: (event: AgentRunLogEvent) => void;
  /** L02 */
  logDAGNode: (event: AgentDAGNodeLogEvent) => void;
  /** L03 */
  logLLMCall: (event: AgentLLMCallLogEvent) => void;
  /** L04 */
  logToolExecute: (event: AgentToolExecuteLogEvent) => void;
  /** L05 */
  logError: (event: AgentErrorLogEvent) => void;
  /** L06 */
  logChangeSetEvent: (event: AgentChangeSetLogEvent) => void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Create an AgentLogger instance from a base Logger.
 *
 * @param baseLogger - Base logger
 * @returns - AgentLogger instance
 */
export const createAgentLogger = (baseLogger: Logger): AgentLogger => {
  const logger = baseLogger.withSituation("agent");

  return {
    logRun: (event) => {
      // oxlint-disable-next-line no-unsafe-type-assertion -- pino logger requires plain object
      logger.info(event as unknown as Record<string, unknown>, event.message);
    }, // L01
    logDAGNode: (event) => {
      // oxlint-disable-next-line no-unsafe-type-assertion -- pino logger requires plain object
      logger.info(event as unknown as Record<string, unknown>, event.message);
    }, // L02
    logLLMCall: (event) => {
      // oxlint-disable-next-line no-unsafe-type-assertion -- pino logger requires plain object
      logger.info(event as unknown as Record<string, unknown>, event.message);
    }, // L03
    logToolExecute: (event) => {
      // oxlint-disable-next-line no-unsafe-type-assertion -- pino logger requires plain object
      logger.info(event as unknown as Record<string, unknown>, event.message);
    }, // L04
    logError: (event) => {
      logger.error(event.error, event.message);
    }, // L05
    logChangeSetEvent: (event) => {
      logger.info(
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        event as unknown as Record<string, unknown>,
        `changeset.${event.type} cs=${event.changesetId}`,
      );
    }, // L06
  };
};

/**
 * Create a no-op AgentLogger (for testing and placeholders).
 */
export const createNoopAgentLogger = (): AgentLogger => ({
  // oxlint-disable-next-line no-empty-function -- intentional noop for testing/placeholder
  logRun: () => {},
  // oxlint-disable-next-line no-empty-function -- intentional noop for testing/placeholder
  logDAGNode: () => {},
  // oxlint-disable-next-line no-empty-function -- intentional noop for testing/placeholder
  logLLMCall: () => {},
  // oxlint-disable-next-line no-empty-function -- intentional noop for testing/placeholder
  logToolExecute: () => {},
  // oxlint-disable-next-line no-empty-function -- intentional noop for testing/placeholder
  logError: () => {},
  // oxlint-disable-next-line no-empty-function -- intentional noop for testing/placeholder
  logChangeSetEvent: () => {},
});
