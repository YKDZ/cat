import {
  and,
  document as documentTable,
  translation as translationTable,
  eq,
  getDrizzleDB,
  glossaryToProject,
  inArray,
  memoryToProject,
  projectTargetLanguage,
  term,
  termRelation,
  translatableElement,
  vector,
} from "@cat/db";
import { PluginRegistry, type TranslationAdvisor } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import { getServiceFromDBId, vectorize } from "@cat/app-server-shared/utils";
import { searchMemory } from "@cat/app-server-shared/utils";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import { config } from "./config.ts";
import { registerTaskUpdateHandlers } from "@/utils/worker.ts";

const { client: drizzle } = await getDrizzleDB();

const queueId = "autoTranslate";

export const autoTranslateQueue = new Queue(queueId, config);

const worker = new Worker(
  queueId,
  async (job) => {
    const { documentId, advisorId, userId, languageId, minMemorySimilarity } = z
      .object({
        userId: z.uuidv7(),
        documentId: z.uuidv7(),
        advisorId: z.int(),
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

    const document = assertSingleNonNullish(
      await drizzle
        .select({
          id: documentTable.id,
          projectId: documentTable.projectId,
        })
        .from(documentTable)
        .where(eq(documentTable.id, documentId)),
    );

    const targetLangRows = await drizzle
      .select({ languageId: projectTargetLanguage.languageId })
      .from(projectTargetLanguage)
      .where(
        and(
          eq(projectTargetLanguage.projectId, document.projectId),
          eq(projectTargetLanguage.languageId, languageId),
        ),
      );

    if (targetLangRows.length === 0)
      throw new Error("Language does not claimed in project");

    const glossaryIds = (
      await drizzle
        .select({ glossaryId: glossaryToProject.glossaryId })
        .from(glossaryToProject)
        .where(eq(glossaryToProject.projectId, document.projectId))
    ).map((r) => r.glossaryId);

    const memoryIds = (
      await drizzle
        .select({ memoryId: memoryToProject.memoryId })
        .from(memoryToProject)
        .where(eq(memoryToProject.projectId, document.projectId))
    ).map((r) => r.memoryId);

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
      .select({
        id: translatableElement.id,
        value: translatableElement.value,
        languageId: translatableElement.languageId,
        embedding: vector.vector,
      })
      .from(translatableElement)
      .innerJoin(vector, eq(translatableElement.embeddingId, vector.id))
      .innerJoin(
        documentTable,
        eq(translatableElement.documentId, documentTable.id),
      )
      .where(eq(documentTable.id, documentId));

    // 自动翻译数据
    // 只有翻译记忆和建议器两个来源
    // 将元素 map 为 translationTable 的 insert 数据
    const translations = await Promise.all(
      elements.map(async (element) => {
        const memories = await searchMemory(
          drizzle,
          element.embedding,
          element.languageId,
          languageId,
          memoryIds,
          minMemorySimilarity,
        );

        // 用记忆充当翻译结果
        if (memories.length > 0) {
          const memory = assertFirstNonNullish(
            memories.sort((a, b) => b.similarity - a.similarity),
          );

          return {
            value: memory.translation,
            translatorId: memory.creatorId,
            translatableElementId: element.id,
            languageId,
            embeddingId: memory.translationEmbeddingId,
            meta: {
              memorySimilarity: memory.similarity,
              memoryId: memory.memoryId,
              memoryItemId: memory.id,
            },
          };
        }
        // 建议器
        else {
          if (!advisor) return undefined;

          if (!advisor.canSuggest(element.languageId, languageId))
            throw new Error("Advisor can not suggest element in document");

          const { termedText, translationIds } =
            await termService.termStore.termText(
              element.value,
              element.languageId,
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
                eq(term.languageId, element.languageId),
                inArray(term.glossaryId, glossaryIds),
              ),
            )
            .innerJoin(
              translationTable,
              and(
                eq(translationTable.id, termRelation.translationId),
                eq(translationTable.languageId, languageId),
                inArray(termRelation.translationId, translationIds),
              ),
            );

          const translation = (
            await advisor.getSuggestions(
              element.value,
              termedText,
              relations,
              element.languageId,
              languageId,
            )
          ).find(({ status }) => status === "SUCCESS");

          if (!translation) return undefined;

          const embeddingId = assertSingleNonNullish(
            await vectorize(drizzle, pluginRegistry, [
              {
                value: translation.value,
                languageId,
              },
            ]),
          );

          return {
            value: translation.value,
            translatorId: userId,
            translatableElementId: element.id,
            languageId,
            embeddingId,
            meta: {
              advisorId,
            },
          };
        }
      }),
    );

    const filtered = translations.filter((z) => !!z);

    // 创建翻译
    await drizzle.insert(translationTable).values(filtered);
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);

export const autoTranslateWorker = worker;
