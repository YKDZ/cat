import { eq, sql, task, type DrizzleClient } from "@cat/db";
import { logger } from "@cat/shared/utils";
import type { Worker } from "bullmq";

export const registerTaskUpdateHandlers = (
  drizzle: DrizzleClient,
  worker: Worker,
  queueId: string,
): void => {
  worker.on("active", (job) => {
    const handler = async () => {
      const id = job.name;

      await updateTaskStatus(drizzle, id, "processing");

      logger.info("PROCESSOR", { msg: `Active ${queueId} task: ${id}` });
    };

    handler().catch((error: unknown) => {
      logger.error(
        "PROCESSOR",
        { msg: `Failed when update status for task ${queueId} task` },
        error,
      );
    });
  });

  worker.on("completed", (job) => {
    const handler = async () => {
      const id = job.name;

      await updateTaskStatus(drizzle, id, "completed");

      logger.info("PROCESSOR", { msg: `Completed ${queueId} task: ${id}` });
    };

    handler().catch((error: unknown) => {
      logger.error(
        "PROCESSOR",
        { msg: `Failed when update status for task ${queueId} task` },
        error,
      );
    });
  });

  worker.on("failed", (job) => {
    if (!job) return;

    const handler = async () => {
      const id = job.name;

      await updateTaskStatus(drizzle, id, "failed", job.stacktrace);

      logger.error(
        "PROCESSOR",
        {
          msg: `Failed ${queueId} task: ${id}`,
        },
        job.stacktrace,
      );
    };

    handler().catch((error: unknown) => {
      logger.error(
        "PROCESSOR",
        { msg: `Failed when update status for task ${queueId} task` },
        error,
      );
    });
  });

  worker.on("error", (error) => {
    logger.error("PROCESSOR", { msg: `Worker throw error` }, error);
  });
};

const updateTaskStatus = async (
  drizzle: DrizzleClient,
  id: string,
  status: "processing" | "completed" | "failed",
  stacktrace?: string[],
) => {
  await drizzle
    .update(task)
    .set({
      meta: sql`COALESCE(${task.meta}, '{}' )::jsonb || ${JSON.stringify({ stacktrace })}::jsonb`,
    })
    .where(eq(task.id, id));
};
