import { serverLogger } from "@cat/server-shared";

import type { RunId } from "@/graph/types";

export interface WorkflowEventMeta extends Record<string, unknown> {
  domain: string;
  event: string;
  runId?: RunId;
}

const agentBaseLogger = serverLogger.withSituation("AGENT");
const workflowEventLogger = agentBaseLogger.withType<WorkflowEventMeta>();

export class WorkflowLogger {
  scheduler = (event: string, meta: Record<string, unknown>): void => {
    workflowEventLogger.debug({ domain: "scheduler", event, ...meta });
  };

  executorPool = (event: string, meta: Record<string, unknown>): void => {
    workflowEventLogger.debug({ domain: "executor-pool", event, ...meta });
  };

  compensation = (event: string, meta: Record<string, unknown>): void => {
    workflowEventLogger.debug({ domain: "compensation", event, ...meta });
  };

  runSummary = (
    runId: RunId,
    event: string,
    meta: Record<string, unknown>,
  ): void => {
    workflowEventLogger.info({ runId, domain: "workflow", event, ...meta });
  };
}

export const defaultWorkflowLogger = new WorkflowLogger();
