import { getPrismaDB, insertVector } from "@cat/db";
import { PluginRegistry, type TextVectorizer } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { getSingle } from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: prisma } = await getPrismaDB();

const queueId = "updateTranslation";

export const updateTranslationQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { translationId, translationValue } = z
      .object({
        translationId: z.int(),
        translationValue: z.string(),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const translation = await prisma.translation.findUnique({
      where: {
        id: translationId,
      },
      select: {
        value: true,
        Language: true,
        vectorizerId: true,
      },
    });

    if (!translation)
      throw new Error("Translation with given id doest not exists");

    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      prisma,
      pluginRegistry,
      translation.vectorizerId,
    );

    // 开始处理翻译的嵌入并插入
    const vectors = await vectorizer.vectorize(translation.Language.id, [
      { value: translationValue, meta: null },
    ]);

    const vector = getSingle(vectors);

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
