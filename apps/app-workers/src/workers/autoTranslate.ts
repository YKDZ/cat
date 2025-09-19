import { getPrismaDB, insertVector } from "@cat/db";
import {
  PluginRegistry,
  type TextVectorizer,
  type TranslationAdvisor,
} from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import type {
  TranslationSuggestion,
  UnvectorizedTextData,
} from "@cat/shared/schema/misc";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import {
  queryElementWithEmbedding,
  searchMemory,
} from "@cat/app-server-shared/utils";
import { getFirst, getIndex, getSingle } from "@cat/app-server-shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: prisma } = await getPrismaDB();

type TranslationData = {
  translation: TranslationSuggestion;
  isMemory: boolean;
  isAdvisor: boolean;
  advisorId?: number;
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
    const {
      documentId,
      advisorId,
      vectorizerId,
      userId,
      languageId,
      minMemorySimilarity,
    } = z
      .object({
        userId: z.ulid(),
        documentId: z.ulid(),
        advisorId: z.int(),
        vectorizerId: z.int(),
        languageId: z.string(),
        minMemorySimilarity: z.number().min(0).max(1),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const advisor = await getServiceFromDBId<TranslationAdvisor>(
      prisma,
      pluginRegistry,
      advisorId,
    );
    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      prisma,
      pluginRegistry,
      vectorizerId,
    );

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
        projectId: true,
        Project: {
          select: {
            Memories: {
              select: {
                id: true,
              },
            },
            Glossaries: {
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

    // TODO 选择安装的服务或者继承
    const { service: termService } = (await pluginRegistry.getPluginService(
      prisma,
      "es-term-service",
      "TERM_SERVICE",
      "ES",
    ))!;

    if (!termService) throw new Error("Term service does not exists");

    const sourceLanguageId = document.Project.SourceLanguage.id;

    // 开自动始翻译

    // 收集可翻译元素
    const elements = await prisma.translatableElement.findMany({
      where: {
        documentId,
        Translations: {
          none: {},
        },
      },
    });

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
          const memory = getFirst(
            memories.sort((a, b) => b.similarity - a.similarity),
          );

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

          const { termedText, translationIds } =
            await termService.termStore.termText(
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
                glossaryId: {
                  in: document.Project.Glossaries.map((g) => g.id),
                },
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

          const vector = getSingle(vectors);

          const embeddingId = await insertVector(prisma, vector);

          if (!embeddingId) throw new Error("Failed to get id of vector");

          return {
            translation,
            advisorId,
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
                memorySimilarity,
                memoryId,
                memoryItemId,
                advisorId,
              },
              embeddingId: embeddingId!,
              vectorizerId,
              languageId,
              translatorId: userId,
              translatableElementId: getIndex(elements, index).id,
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
