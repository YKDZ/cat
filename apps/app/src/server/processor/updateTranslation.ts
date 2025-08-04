import { getPrismaDB, insertVector } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { logger } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { config } from "./config";

const { client: prisma } = await getPrismaDB();

const queueId = "updateTranslation";

export const updateTranslationQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      translationId,
      translationValue,
      vectorizerId,
    }: {
      translationId: number;
      translationValue: string;
      vectorizerId: string;
    } = job.data;

    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins(prisma, {
      silent: true,
      tags: ["text-vectorizer"],
    });

    const vectorizer = pluginRegistry.getTextVectorizer(vectorizerId);

    if (!vectorizer)
      throw new Error(`Can not find vectorizer by given id: '${vectorizerId}'`);

    const translation = await prisma.translation.findUnique({
      where: {
        id: translationId,
      },
      select: {
        value: true,
        Language: true,
      },
    });

    if (!translation)
      throw new Error("Translation with given id doest not exists");

    // 开始处理翻译的嵌入并插入
    const vectors = await vectorizer.vectorize(translation.Language.id, [
      { value: translationValue, meta: null },
    ]);

    if (vectors.length !== 1) {
      throw new Error("Vectorizer does not work well");
    }

    const vector = vectors[0];

    await prisma.$transaction(async (tx) => {
      const embeddingId = await insertVector(tx, vector);

      if (!embeddingId) throw new Error("Failed to get id of vector");

      await tx.translation.update({
        where: {
          id: translationId,
        },
        data: {
          value: translationValue,
          embeddingId,
        },
      });

      await tx.memoryItem.updateMany({
        where: {
          translationId,
        },
        data: {
          translation: translationValue,
          translationEmbeddingId: embeddingId,
        },
      });
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

worker.on("active", async (job) => {
  const id = job.name;

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
  const id = job.name;

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

  const id = job.name;

  await prisma.task.update({
    where: {
      id,
    },
    data: {
      status: "failed",
    },
  });

  logger.error("PROCESSER", `Failed ${queueId} task: ${id}`, job.stacktrace);
});

worker.on("error", async (error) => {
  logger.error("PROCESSER", `Worker throw error`, error);
});
