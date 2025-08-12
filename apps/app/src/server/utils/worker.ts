import type { PrismaClient } from "@cat/db";
import { logger } from "@cat/shared";
import type { Worker } from "bullmq";

export const registerTaskUpdateHandlers = (
  prisma: PrismaClient,
  worker: Worker,
  queueId: string,
) => {
  worker.on("active", async (job) => {
    const id = job.name;

    await prisma.task.update({
      where: {
        id,
      },
      data: {
        status: "processing",
        meta: {
          job,
        },
      },
    });

    logger.info("PROCESSOR", { msg: `Active ${queueId} task: ${id}` });
  });

  worker.on("completed", async (job) => {
    const id = job.name;

    await prisma.task.update({
      where: {
        id,
      },
      data: {
        status: "completed",
        meta: {
          job,
        },
      },
    });

    logger.info("PROCESSOR", { msg: `Completed ${queueId} task: ${id}` });
  });

  worker.on("failed", async (job) => {
    if (!job) return;

    const id = job.name;

    await prisma.task.update({
      where: {
        id,
      },
      data: {
        status: "failed",
        meta: {
          job,
        },
      },
    });

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
