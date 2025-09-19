import type { PrismaClient } from "@cat/db";
import { logger } from "@cat/shared/utils";
import type { Worker } from "bullmq";

export const registerTaskUpdateHandlers = (
  prisma: PrismaClient,
  worker: Worker,
  queueId: string,
) => {
  worker.on("active", async (job) => {
    const id = job.name;

    await updateTaskStatus(prisma, id, "processing");

    logger.info("PROCESSOR", { msg: `Active ${queueId} task: ${id}` });
  });

  worker.on("completed", async (job) => {
    const id = job.name;

    await updateTaskStatus(prisma, id, "completed");

    logger.info("PROCESSOR", { msg: `Completed ${queueId} task: ${id}` });
  });

  worker.on("failed", async (job) => {
    if (!job) return;

    const id = job.name;

    await updateTaskStatus(prisma, id, "failed", job.stacktrace);

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
  stacktrace?: string[],
) => {
  await prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: {
        id,
      },
    });

    if (!task) throw new Error("Task not found");

    if (task.meta && typeof task.meta !== "object")
      throw new Error("Invalid task meta");

    const meta = (task.meta as object) ?? {};

    await tx.task.update({
      where: {
        id,
      },
      data: {
        status,
        meta: {
          ...meta,
          stacktrace,
        },
      },
    });
  });
};
