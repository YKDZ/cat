import type { Logger } from "@cat/shared/utils";

// ─── Log Event Types ──────────────────────────────────────────────────────────

/**
 * @zh L01: Agent 运行级别日志事件（run 开始/结束）。
 * @en L01: Agent run-level log event (run start/end).
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
 * @zh L02: DAG 节点日志事件（每个节点进入/退出）。
 * @en L02: DAG node log event (each node enter/exit).
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
 * @zh L03: LLM 调用日志事件。
 * @en L03: LLM call log event.
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
 * @zh L04: 工具执行日志事件。
 * @en L04: Tool execution log event.
 */
export interface AgentToolExecuteLogEvent {
  toolName: string;
  status: "started" | "completed" | "failed";
  durationMs?: number;
  message: string;
}

/**
 * @zh L05: Agent 错误日志事件。
 * @en L05: Agent error log event.
 */
export interface AgentErrorLogEvent {
  error: Error;
  nodeType?: string;
  message: string;
}

// ─── AgentLogger ──────────────────────────────────────────────────────────────

/**
 * @zh Agent 结构化日志接口。
 * @en Agent structured logger interface.
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
}

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * @zh 从基础 Logger 创建 AgentLogger 实例。
 * @en Create an AgentLogger instance from a base Logger.
 *
 * @param baseLogger - {@zh 基础日志记录器} {@en Base logger}
 * @returns - {@zh AgentLogger 实例} {@en AgentLogger instance}
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
  };
};

/**
 * @zh 创建一个无操作的 AgentLogger（用于测试和占位）。
 * @en Create a no-op AgentLogger (for testing and placeholders).
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
});
