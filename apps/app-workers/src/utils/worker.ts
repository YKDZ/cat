import { eq, sql, task, type DrizzleClient } from "@cat/db";
import { logger } from "@cat/shared/utils";
import type { Worker } from "bullmq";

export const registerTaskUpdateHandlers = (
  drizzle: DrizzleClient,
  worker: Worker,
  queueId: string,
): void => {
  worker.on("active", async (job) => {
    const id = job.name;

    await updateTaskStatus(drizzle, id, "processing");

    logger.info("PROCESSOR", { msg: `Active ${queueId} task: ${id}` });
  });

  worker.on("completed", async (job) => {
    const id = job.name;

    await updateTaskStatus(drizzle, id, "completed");

    logger.info("PROCESSOR", { msg: `Completed ${queueId} task: ${id}` });
  });

  worker.on("failed", async (job) => {
    if (!job) return;

    const id = job.name;

    await updateTaskStatus(drizzle, id, "failed", job.stacktrace);

    logger.error(
      "PROCESSOR",
      {
        msg: `Failed ${queueId} task: ${id}`,
      },
      job.stacktrace,
    );
  });

  worker.on("error", async (error) => {
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
