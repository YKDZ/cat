import {
  and,
  document as documentTale,
  translation as translationTable,
  eq,
  getDrizzleDB,
  glossaryToProject,
  inArray,
  insertVector,
  language,
  memoryToProject,
  project,
  projectTargetLanguage,
  sql,
  term,
  termRelation,
  translatableElement,
} from "@cat/db";
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
import { getFirst, getIndex, getSingle } from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: drizzle } = await getDrizzleDB();

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
        userId: z.uuidv7(),
        documentId: z.uuidv7(),
        advisorId: z.int(),
        vectorizerId: z.int(),
        languageId: z.string(),
        minMemorySimilarity: z.number().min(0).max(1),
      })
      .parse(job.data);

    const pluginRegistry = PluginRegistry.get("GLOBAL", "");

    const advisor = await getServiceFromDBId<TranslationAdvisor>(
      drizzle,
      pluginRegistry,
      advisorId,
    );
    const vectorizer = await getServiceFromDBId<TextVectorizer>(
      drizzle,
      pluginRegistry,
      vectorizerId,
    );

    if (minMemorySimilarity > 1 || minMemorySimilarity < 0) {
      throw new Error("Min memory similarity should between 0 and 1");
    }

    const docRow = getSingle(
      await drizzle
        .select({
          id: documentTale.id,
          projectId: documentTale.projectId,
          project: {
            id: project.id,
            sourceLanguageId: project.sourceLanguageId,
          },
        })
        .from(documentTale)
        .innerJoin(project, eq(documentTale.projectId, project.id))
        .where(eq(documentTale.id, documentId)),
    );

    if (!docRow) throw new Error("Document not found");

    const targetLangRows = await drizzle
      .select({ languageId: projectTargetLanguage.languageId })
      .from(projectTargetLanguage)
      .where(
        and(
          eq(projectTargetLanguage.projectId, docRow.project.id),
          eq(projectTargetLanguage.languageId, languageId),
        ),
      )
      .execute();

    if (targetLangRows.length === 0)
      throw new Error("Language does not claimed in project");

    const glossaryIds = (
      await drizzle
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, docRow.project.id))
    ).map((r) => r.glossaryId);

    const memoryIds = (
      await drizzle
        .select({ memoryId: memoryToProject.memoryId })
        .from(memoryToProject)
        .where(eq(memoryToProject.projectId, docRow.project.id))
    ).map((r) => r.memoryId);

    const sourceLanguageId = getSingle(
      await drizzle
        .select({ id: language.id })
        .from(language)
        .where(eq(language.id, docRow.project.sourceLanguageId)),
    ).id;

    const document = {
      projectId: docRow.projectId,
      Project: {
        Memories: memoryIds.map((id) => ({ id })),
        Glossaries: glossaryIds.map((id) => ({ id })),
        SourceLanguage: { id: sourceLanguageId },
      },
    };

    if (!document)
      throw new Error(
        "Document does not exists or language does not claimed in project",
      );

    // TODO 选择安装的服务或者继承
    const { service: termService } = (await pluginRegistry.getPluginService(
      drizzle,
      "es-term-service",
      "TERM_SERVICE",
      "ES",
    ))!;

    if (!termService) throw new Error("Term service does not exists");

    // 开自动始翻译

    const elements = await drizzle
      .select()
      .from(translatableElement)
      .where(
        and(
          eq(translatableElement.documentId, documentId),
          sql`NOT EXISTS (SELECT 1 FROM "Translation" t WHERE t."translatableElementId" = ${translatableElement.id})`,
        ),
      )
      .execute();

    // 自动翻译数据
    // 只有翻译记忆和建议器两个来源
    const translations: TranslationData[] = await Promise.all(
      elements.map(async (element) => {
        const embeddedElement = await queryElementWithEmbedding(
          drizzle,
          element.id,
        );
        const memories = await searchMemory(
          drizzle,
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
          const relations = await drizzle
            .select({
              termId: termRelation.termId,
              translationId: termRelation.translationId,
              Term: term,
              Translation: translationTable,
            })
            .from(termRelation)
            .innerJoin(
              term,
              and(
                eq(term.id, termRelation.termId),
                eq(term.languageId, sourceLanguageId),
                inArray(
                  term.glossaryId,
                  document.Project.Glossaries.map((g) => g.id),
                ),
              ),
            )
            .innerJoin(
              translationTable,
              and(
                eq(translationTable.id, termRelation.translationId),
                eq(translationTable.languageId, languageId),
                inArray(termRelation.translationId, translationIds),
              ),
            )
            .execute();

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

          const embeddingId = await insertVector(drizzle, vector);

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
    // drizzle 批量插入 translation
    const translationRows = translations
      .map((data, index) => ({ data, index }))
      .filter(({ data }) => data.translation.status === "SUCCESS")
      .map(
        ({
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
          index,
        }) => ({
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
        }),
      );
    if (translationRows.length > 0)
      await drizzle.insert(translationTable).values(translationRows).execute();
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);

export const autoTranslateWorker = worker;
