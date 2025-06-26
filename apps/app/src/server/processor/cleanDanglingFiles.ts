import { prisma } from "@cat/db";
import { logger } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { useStorage } from "../utils/storage/useStorage";
import { config } from "./config";

const queueId = "cleanDanglingFiles";

export const cleanDanglingFilesQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    // 所有外键都悬空的且一个月内没有更新的文件被视为悬空文件
    // TODO 配置定时
    const oneMonthAgo = new Date();
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
    const files = await prisma.file.findMany({
      where: {
        documentId: null,
        userId: null,
        updatedAt: {
          lt: oneMonthAgo,
        },
      },
    });
    const storage = (await useStorage()).storage;

    await Promise.all(files.map(async (file) => await storage.delete(file)));

    await prisma.file.deleteMany({
      where: {
        id: {
          in: files.map((file) => file.id),
        },
      },
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

worker.on("active", async (job) => {
  const id = job.data.taskId as string;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "processing",
    },
  });

  logger.info("PROCESSER", `Active ${queueId} task: ${id}`);
});

worker.on("completed", async (job) => {
  const id = job.data.taskId as string;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "completed",
    },
  });

  logger.info("PROCESSER", `Completed ${queueId} task: ${id}`);
});

worker.on("failed", async (job) => {
  if (!job) return;

  const id = job.data.taskId as string;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "failed",
    },
  });

  logger.error("PROCESSER", `Failed ${queueId} task: ${id}`, job);
});
