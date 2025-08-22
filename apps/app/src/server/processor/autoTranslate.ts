import { getPrismaDB, insertVector } from "@cat/db";
import type { TranslationAdvisor } from "@cat/plugin-core";
import { PluginRegistry } from "@cat/plugin-core";
import type { TranslationSuggestion, UnvectorizedTextData } from "@cat/shared";
import { TranslatableElementSchema } from "@cat/shared";
import { Queue, Worker } from "bullmq";
import { z } from "zod";
import { config } from "./config";
import { queryElementWithEmbedding, searchMemory } from "../utils/memory";
import { EsTermStore } from "../utils/es";
import { registerTaskUpdateHandlers } from "../utils/worker";

const { client: prisma } = await getPrismaDB();

type TranslationData = {
  translation: TranslationSuggestion;
  isMemory: boolean;
  isAdvisor: boolean;
  advisorId?: string;
  advisorPluginId?: string;
  memorySimilarity?: number;
  memoryId?: string;
  memoryItemId?: number;
  embeddingId?: number;
};

const queueId = "autoTranslate";

export const autoTranslateQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const pluginRegistry = new PluginRegistry();

    await pluginRegistry.loadPlugins(prisma, {
      silent: true,
      tags: ["translation-advisor", "text-vectorizer"],
    });

    const {
      documentId,
      advisorId,
      advisorPluginId,
      vectorizerId,
      userId,
      languageId,
      minMemorySimilarity,
    } = job.data as {
      userId: string;
      documentId: string;
      advisorId: string;
      advisorPluginId: string;
      vectorizerId: string;
      languageId: string;
      minMemorySimilarity: number;
    };

    const advisor: TranslationAdvisor | null =
      (
        await pluginRegistry.getTranslationAdvisor(prisma, advisorPluginId)
      ).find((advisor) => advisor.getId() === advisorId) ?? null;

    const vectorizer = (await pluginRegistry.getTextVectorizers(prisma))
      .map((d) => d.vectorizer)
      .find((vectorizer) => vectorizer.getId() === vectorizerId);

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

    const sourceLanguageId = document.Project.SourceLanguage.id;

    // 开自动始翻译

    // 收集可翻译元素
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

    // 自动翻译数据
    // 只有翻译记忆和建议器两个来源
    const translations: TranslationData[] = await Promise.all(
      elements.map(async (element) => {
        const embeddedElement = await queryElementWithEmbedding(element.id);
        const memories = await searchMemory(
          embeddedElement.embedding,
          sourceLanguageId,
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
            embeddingId: memory.translationEmbeddingId,
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

          if (!advisor.canSuggest(element, sourceLanguageId, languageId))
            throw new Error("Advisor can not suggest element in document");

          const { termedText, translationIds } = await EsTermStore.termText(
            element.value,
            sourceLanguageId,
            languageId,
          );
          const relations = await prisma.termRelation.findMany({
            where: {
              translationId: {
                in: translationIds,
              },
              Term: {
                languageId: sourceLanguageId,
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
              sourceLanguageId,
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

          if (!vectorizer) throw new Error("Vectorizer does not exists");

          const vectors = await vectorizer.vectorize(languageId, [
            {
              value: translation.value,
              meta: null,
            } satisfies UnvectorizedTextData,
          ]);

          if (vectors.length !== 1) {
            throw new Error("Vectorizer does not return 1 vector");
          }

          const vector = vectors[0];

          const embeddingId = await insertVector(prisma, vector);

          if (!embeddingId) throw new Error("Failed to get id of vector");

          return {
            translation,
            advisorId: advisor.getId(),
            advisorPluginId,
            isAdvisor: true,
            isMemory: false,
            embeddingId,
          } satisfies TranslationData;
        }
      }),
    );

    // 创建翻译
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
                embeddingId,
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
                advisorPluginId,
              },
              embeddingId: embeddingId!,
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

registerTaskUpdateHandlers(prisma, worker, queueId);

export const autoTranslateWorker = worker;
