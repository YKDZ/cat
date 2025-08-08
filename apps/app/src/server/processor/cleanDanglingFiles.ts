import { logger } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { useStorage } from "../utils/storage/useStorage";
import { config } from "./config";
import { getPrismaDB } from "@cat/db";
import { registerTaskUpdateHandlers } from "../utils/worker";

const { client: prisma } = await getPrismaDB();

const queueId = "cleanDanglingFiles";

export const cleanDanglingFilesQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async () => {
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

registerTaskUpdateHandlers(prisma, worker, queueId);
