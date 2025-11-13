import type { Worker } from "bullmq";
import { logger } from "@cat/shared/utils";

/**
 * 创建任务生命周期处理器
 */
export function createTaskLifecycleHandler(
  worker: Worker,
  queueId: string,
): void {
  // 任务开始执行
  worker.on("active", (job) => {
    const handler = async () => {
      const taskId = job.name;

      logger.info("PROCESSOR", {
        msg: `Task ${taskId} started in queue ${queueId}`,
        taskId,
        queueId,
      });
    };

    handler().catch((error: unknown) => {
      logger.error(
        "PROCESSOR",
        {
          msg: `Failed to update task status to processing`,
          taskId: job.name,
          queueId,
        },
        error,
      );
    });
  });

  // 任务完成
  worker.on("completed", (job) => {
    const handler = async () => {
      const taskId = job.name;

      logger.info("PROCESSOR", {
        msg: `Task ${taskId} completed in queue ${queueId}`,
        taskId,
        queueId,
      });
    };

    handler().catch((error: unknown) => {
      logger.error(
        "PROCESSOR",
        {
          msg: `Failed to update task status to completed`,
          taskId: job.name,
          queueId,
        },
        error,
      );
    });
  });

  // 任务失败
  worker.on("failed", (job) => {
    if (!job) return;

    const handler = async () => {
      const taskId = job.name;

      logger.error(
        "PROCESSOR",
        {
          msg: `Task ${taskId} failed in queue ${queueId}`,
          taskId,
          queueId,
          stacktrace: job.stacktrace,
        },
        job.failedReason,
      );
    };

    handler().catch((error: unknown) => {
      logger.error(
        "PROCESSOR",
        {
          msg: `Failed to update task status to failed`,
          taskId: job.name,
          queueId,
        },
        error,
      );
    });
  });

  // Worker 错误
  worker.on("error", (error) => {
    logger.error(
      "PROCESSOR",
      {
        msg: `Worker error in queue ${queueId}`,
        queueId,
      },
      error,
    );
  });
}
