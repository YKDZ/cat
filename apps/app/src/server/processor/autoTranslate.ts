import { prisma } from "@cat/db";
import type { TranslationAdvisor } from "@cat/plugin-core";
import { PluginRegistry } from "@cat/plugin-core";
import type { TranslationSuggestion } from "@cat/shared";
import { logger, TranslatableElementSchema } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { z } from "zod/v4";
import { config } from "./config";
import { queryElementWithEmbedding, searchMemory } from "../utils/memory";
import { EsTermIndexService, EsTermStore } from "../utils/es";

const queueId = "autoTranslate";

export const autoTranslateQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins({
      silent: true,
      tags: ["translation-advisor"],
    });

    const { documentId, advisorId, userId, languageId, minMemorySimilarity } =
      job.data as {
        userId: string;
        documentId: string;
        advisorId: string;
        languageId: string;
        minMemorySimilarity: number;
      };

    if (minMemorySimilarity > 1 || minMemorySimilarity < 0) {
      throw new Error("Min memory similarity should between 0 and 1");
    }

    const document = await prisma.document.findUnique({
      where: {
        id: documentId,
        Project: {
          TargetLanguages: {
            some: {
              id: languageId,
            },
          },
        },
      },
      select: {
        Project: {
          select: {
            Memories: {
              select: {
                id: true,
              },
            },
            SourceLanguage: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    if (!document)
      throw new Error(
        "Document does not exists or language does not claimed in project",
      );

    const sourceLangugeId = document.Project.SourceLanguage.id;

    let advisor: TranslationAdvisor | null = null;

    if (advisorId) {
      advisor =
        (
          await pluginRegistry.getTranslationAdvisors({
            userId,
          })
        ).find((advisor) => advisor.getId() === advisorId) ?? null;

      if (!advisor) throw new Error("Advisor with given id does not exists");

      if (!advisor.isEnabled())
        throw new Error("Advisor with given id does not enabled");
    }

    // 开始翻译

    const elements = z.array(TranslatableElementSchema).parse(
      await prisma.translatableElement.findMany({
        where: {
          documentId,
          Translations: {
            none: {},
          },
        },
      }),
    );

    const translations: {
      translation: TranslationSuggestion;
      isMemory: boolean;
      isAdvisor: boolean;
      advisorId?: string;
      memorySimilarity?: number;
      memoryId?: string;
      memoryItemId?: number;
    }[] = await Promise.all(
      elements.map(async (element) => {
        const embededElement = await queryElementWithEmbedding(element.id);
        const memories = await searchMemory(
          embededElement.embedding,
          sourceLangugeId,
          languageId,
          document.Project.Memories.map((memory) => memory.id),
          minMemorySimilarity,
        );

        // 记忆
        if (memories.length > 0) {
          const memory = memories.sort(
            (a, b) => b.similarity - a.similarity,
          )[0];

          return {
            translation: {
              from: element.value,
              value: memory.translation,
              status: "SUCCESS",
            } satisfies TranslationSuggestion,
            isMemory: true,
            isAdvisor: false,
            memorySimilarity: memory.similarity,
            memoryId: memory.memoryId,
            memoryItemId: memory.id,
          };
        }
        // 建议器
        else {
          if (!advisor)
            return {
              translation: {
                from: element.value,
                value: "",
                status: "ERROR",
              } satisfies TranslationSuggestion,
              isAdvisor: false,
              isMemory: false,
            };

          if (!advisor.canSuggest(element, sourceLangugeId, languageId))
            throw new Error("Advisor can not suggest element in document");

          const { termedText, translationIds } = await EsTermStore.termText(
            element.value,
            sourceLangugeId,
            languageId,
          );
          const relations = await prisma.termRelation.findMany({
            where: {
              translationId: {
                in: translationIds,
              },
              Term: {
                languageId: sourceLangugeId,
              },
              Translation: {
                languageId,
              },
            },
            include: {
              Term: true,
              Translation: true,
            },
          });

          const translation = (
            await advisor.getSuggestions(
              element,
              termedText,
              relations,
              sourceLangugeId,
              languageId,
            )
          ).find(({ status }) => status === "SUCCESS");

          if (!translation)
            return {
              translation: {
                from: element.value,
                value: "",
                status: "ERROR",
              } satisfies TranslationSuggestion,
              isAdvisor: false,
              isMemory: false,
            };

          return {
            translation,
            advisorId: advisor.getId(),
            isAdvisor: true,
            isMemory: false,
          };
        }
      }),
    );

    await prisma.translation.createMany({
      data: translations
        .map((data, index) => ({ data, index }))
        .filter(({ data }) => data.translation.status === "SUCCESS")
        .map(
          (
            {
              data: {
                translation,
                isAdvisor,
                isMemory,
                advisorId,
                memoryItemId,
                memorySimilarity,
                memoryId,
              },
            },
            index,
          ) => {
            return {
              value: translation.value,
              meta: {
                isAutoTranslation: true,
                isAdvisor,
                isMemory,
                advisorId,
                memorySimilarity,
                memoryId,
                memoryItemId,
              },
              languageId,
              translatorId: userId,
              translatableElementId: elements[index].id,
            };
          },
        ),
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
      id: job.data.taskId as string,
    },
    data: {
      status: "failed",
    },
  });

  logger.error("PROCESSER", `Failed ${queueId} task: ${id}`, job);
});

export const autoTranslateWorker = worker;
