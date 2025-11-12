import type { Worker } from "bullmq";
import { eq, task, type DrizzleClient } from "@cat/db";
import { logger } from "@cat/shared/utils";

/**
 * 更新任务状态
 */
const updateTaskStatus = async (
  drizzle: DrizzleClient,
  taskId: string,
  status: "processing" | "completed" | "failed",
): Promise<void> => {
  await drizzle.update(task).set({ status }).where(eq(task.id, taskId));
};

/**
 * 创建任务生命周期处理器
 * 监听 Worker 事件并更新数据库中的任务状态
 */
export function createTaskLifecycleHandler(
  drizzle: DrizzleClient,
  worker: Worker,
  queueId: string,
): void {
  // 任务开始执行
  worker.on("active", (job) => {
    const handler = async () => {
      const taskId = job.name;
      await updateTaskStatus(drizzle, taskId, "processing");

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
      await updateTaskStatus(drizzle, taskId, "completed");

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
      await updateTaskStatus(drizzle, taskId, "failed");

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
