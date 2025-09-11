import type { PrismaClient } from "@cat/db";
import { logger } from "@cat/shared/utils";
import type { Job, Worker } from "bullmq";

export const registerTaskUpdateHandlers = (
  prisma: PrismaClient,
  worker: Worker,
  queueId: string,
) => {
  worker.on("active", async (job) => {
    const id = job.name;

    await updateTaskStatus(prisma, id, "processing", job);

    logger.info("PROCESSOR", { msg: `Active ${queueId} task: ${id}` });
  });

  worker.on("completed", async (job) => {
    const id = job.name;

    await updateTaskStatus(prisma, id, "completed", job);

    logger.info("PROCESSOR", { msg: `Completed ${queueId} task: ${id}` });
  });

  worker.on("failed", async (job) => {
    if (!job) return;

    const id = job.name;

    await updateTaskStatus(prisma, id, "failed", job);

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
  prisma: PrismaClient,
  id: string,
  status: "processing" | "completed" | "failed",
  job: Job,
) => {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: {
        id,
      },
    });

    if (!task || !(task.meta === null || typeof task.meta === "object"))
      throw new Error("Task has wrong meta");

    await tx.task.update({
      where: {
        id,
      },
      data: {
        status,
        meta: {
          ...task.meta,
          job,
        },
      },
    });
  });
};
