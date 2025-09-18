import { getPrismaDB, insertVector } from "@cat/db";
import { PluginRegistry, type TextVectorizer } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { registerTaskUpdateHandlers } from "../utils/worker.ts";
import { config } from "./config.ts";
import { getServiceFromDBId } from "@/server/utils/plugin.ts";
import { getSingle } from "@/server/utils/array.ts";

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
    } = z
      .object({
        translationValue: z.string(),
        translationLanguageId: z.string(),
        elementId: z.number(),
        creatorId: z.ulid(),
        vectorizerId: z.number(),
        createMemory: z.boolean(),
        memoryIds: z.array(z.ulid()),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      prisma,
      pluginRegistry,
      vectorizerId,
    );

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

    const vector = getSingle(vectors);

    await prisma.$transaction(async (tx) => {
      const embeddingId = await insertVector(tx, vector);

      if (!embeddingId) throw new Error("Failed to get id of vector");

      const translation = await tx.translation.create({
        data: {
          value: translationValue,
          Vectorizer: {
            connect: {
              id: vectorizerId,
            },
          },
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
            // TODO 源语言应该成为元素的属性
            sourceLanguageId: element.Document!.Project.sourceLanguageId,
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
