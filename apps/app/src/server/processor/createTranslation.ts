import { getPrismaDB, insertVector } from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import { logger } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { config } from "./config";
import { registerTaskUpdateHandlers } from "../utils/worker";

const { client: prisma } = await getPrismaDB();

const queueId = "createTranslation";

export const createTranslationQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const {
      translationValue,
      translationLanguageId,
      elementId,
      creatorId,
      vectorizerId,
      createMemory,
      memoryIds,
    }: {
      translationValue: string;
      translationLanguageId: string;
      elementId: number;
      creatorId: string;
      createMemory: boolean;
      vectorizerId: string;
      memoryIds: string[];
    } = job.data;

    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins(prisma, {
      silent: true,
      tags: ["text-vectorizer"],
    });

    const vectorizer = pluginRegistry.getTextVectorizer(vectorizerId);

    if (!vectorizer)
      throw new Error(`Can not find vectorizer by given id: '${vectorizerId}'`);

    const element = await prisma.translatableElement.findUnique({
      where: {
        id: elementId,
      },
      select: {
        value: true,
        embeddingId: true,
        Document: {
          select: {
            Project: {
              select: {
                sourceLanguageId: true,
              },
            },
          },
        },
      },
    });

    if (!element)
      throw new Error("TranslatableElement with given id doest not exists");

    // 开始处理翻译的嵌入并插入
    const vectors = await vectorizer.vectorize(translationLanguageId, [
      { value: translationValue, meta: null },
    ]);

    if (vectors.length !== 1) {
      throw new Error("Vectorizer does not work well");
    }

    const vector = vectors[0];

    await prisma.$transaction(async (tx) => {
      const embeddingId = await insertVector(tx, vector);

      if (!embeddingId) throw new Error("Failed to get id of vector");

      const translation = await tx.translation.create({
        data: {
          value: translationValue,
          TranslatableElement: {
            connect: {
              id: elementId,
            },
          },
          Language: {
            connect: {
              id: translationLanguageId,
            },
          },
          Translator: {
            connect: {
              id: creatorId,
            },
          },
          Embedding: {
            connect: {
              id: embeddingId,
            },
          },
        },
        include: {
          Translator: true,
        },
      });

      if (createMemory) {
        await tx.memoryItem.createMany({
          data: memoryIds.map((memoryId) => ({
            source: element.value,
            sourceLanguageId: element.Document.Project.sourceLanguageId,
            translation: translation.value,
            translationLanguageId,
            sourceElementId: elementId,
            translationId: translation.id,
            memoryId,
            creatorId,
            sourceEmbeddingId: element.embeddingId,
            translationEmbeddingId: translation.embeddingId,
          })),
        });
      }
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(prisma, worker, queueId);
