import { getPrismaDB, insertVector } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/server/utils/worker.ts";

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

    const vectorizer = (await pluginRegistry.getTextVectorizers(prisma))
      .map((d) => d.vectorizer)
      .find((vectorizer) => vectorizer.getId() === vectorizerId);

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

registerTaskUpdateHandlers(prisma, worker, queueId);
