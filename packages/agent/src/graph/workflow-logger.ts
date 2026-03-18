import { logger } from "@cat/shared/utils";

import type { RunId } from "@/graph/types";

type LoggerMeta = Record<string, unknown>;

export class WorkflowLogger {
  scheduler = (event: string, meta: LoggerMeta): void => {
    logger.debug("AGENT", { domain: "scheduler", event, ...meta });
  };

  executorPool = (event: string, meta: LoggerMeta): void => {
    logger.debug("AGENT", { domain: "executor-pool", event, ...meta });
  };

  compensation = (event: string, meta: LoggerMeta): void => {
    logger.debug("AGENT", { domain: "compensation", event, ...meta });
  };

  runSummary = (runId: RunId, event: string, meta: LoggerMeta): void => {
    logger.info("AGENT", { runId, domain: "workflow", event, ...meta });
  };
}

export const defaultWorkflowLogger = new WorkflowLogger();
