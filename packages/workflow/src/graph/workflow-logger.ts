import { serverLogger } from "@cat/server-shared";

import type { RunId } from "#/graph/types.ts";

export interface WorkflowEventMeta extends Record<string, unknown> {
  domain: string;
  event: string;
  runId?: RunId;
}

const agentBaseLogger = serverLogger.child({ component: "agent" });
const workflowEventLogger = agentBaseLogger.child({ domain: "workflow" });

export class WorkflowLogger {
  scheduler = (event: string, meta: Record<string, unknown>): void => {
    workflowEventLogger.debug("diagnostic event", {
      domain: "scheduler",
      event,
      ...meta,
    });
  };

  executorPool = (event: string, meta: Record<string, unknown>): void => {
    workflowEventLogger.debug("diagnostic event", {
      domain: "executor-pool",
      event,
      ...meta,
    });
  };

  compensation = (event: string, meta: Record<string, unknown>): void => {
    workflowEventLogger.debug("diagnostic event", {
      domain: "compensation",
      event,
      ...meta,
    });
  };

  runSummary = (
    runId: RunId,
    event: string,
    meta: Record<string, unknown>,
  ): void => {
    workflowEventLogger.info("diagnostic event", {
      runId,
      domain: "workflow",
      event,
      ...meta,
    });
  };
}

export const defaultWorkflowLogger = new WorkflowLogger();
