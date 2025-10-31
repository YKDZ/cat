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
  sql,
  term,
  termRelation,
  translatableElement,
  translatableString,
  chunkSet,
  chunk,
  aliasedTable,
} from "@cat/db";
import { PluginRegistry, type TranslationAdvisor } from "@cat/plugin-core";
import { Queue, Worker } from "bullmq";
import * as z from "zod/v4";
import {
  createStringFromData,
  getServiceFromDBId,
} from "@cat/app-server-shared/utils";
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

    // TODO 配置
    const vectorStorage = assertFirstNonNullish(
      await pluginRegistry.getPluginServices(drizzle, "VECTOR_STORAGE"),
    );

    // TODO 配置
    const vectorizer = assertFirstNonNullish(
      await pluginRegistry.getPluginServices(drizzle, "TEXT_VECTORIZER"),
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

    // 开始翻译

    const elements = await drizzle
      .select({
        id: translatableElement.id,
        value: translatableString.value,
        languageId: translatableString.languageId,
        chunkIds: sql<
          number[]
        >`coalesce(array_agg("Chunk"."id"), ARRAY[]::int[])`,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .innerJoin(
        documentTable,
        eq(translatableElement.documentId, documentTable.id),
      )
      .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
      .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
      .where(eq(documentTable.id, documentId))
      .groupBy(
        translatableElement.id,
        translatableString.value,
        translatableString.languageId,
      );

    // 自动翻译数据
    // 只有翻译记忆和建议器两个来源
    // 将元素 map 为 translationTable 的 insert 数据
    const translations = await Promise.all(
      elements.map(async (element) => {
        const chunks = await vectorStorage.service.retrieve(element.chunkIds);

        if (!chunks)
          throw new Error(`No embeddings found for element ${element.id}`);

        const embeddings = chunks.map((chunk) => chunk.vector);

        const memories = await searchMemory(
          drizzle,
          vectorStorage.service,
          embeddings,
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
          const sourceTerm = aliasedTable(term, "sourceTerm");
          const translationTerm = aliasedTable(term, "translationTerm");
          const sourceString = aliasedTable(translatableString, "sourceString");
          const translationString = aliasedTable(
            translatableString,
            "translationString",
          );
          const relations = await drizzle
            .select({
              term: sourceString.value,
              translation: translationString.value,
            })
            .from(termRelation)
            .innerJoin(
              sourceTerm,
              and(
                eq(sourceTerm.id, termRelation.termId),
                inArray(sourceTerm.glossaryId, glossaryIds),
              ),
            )
            .innerJoin(
              translationTerm,
              and(
                eq(translationTerm.id, termRelation.translationId),
                inArray(translationTerm.glossaryId, glossaryIds),
                inArray(translationTerm.id, translationIds),
              ),
            )
            .innerJoin(
              sourceString,
              and(
                eq(sourceString.id, sourceTerm.stringId),
                eq(sourceString.languageId, element.languageId),
              ),
            )
            .innerJoin(
              translationString,
              and(
                eq(translationString.id, translationTerm.stringId),
                eq(translationString.languageId, languageId),
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

          return {
            value: translation.value,
            translatorId: userId,
            translatableElementId: element.id,
            languageId,
            meta: {
              advisorId,
            },
          };
        }
      }),
    );

    const filtered = translations.filter((z) => !!z);

    // 创建翻译
    await drizzle.transaction(async (tx) => {
      const stringIds = await createStringFromData(
        tx,
        vectorizer.service,
        vectorizer.id,
        vectorStorage.service,
        vectorStorage.id,
        filtered.map((item) => ({
          value: item.value,
          languageId: item.languageId,
        })),
      );
      await tx.insert(translationTable).values(
        filtered.map((item, index) => ({
          ...item,
          stringId: stringIds[index],
        })),
      );
    });
  },
  {
    ...config,
    concurrency: 50,
  },
);

registerTaskUpdateHandlers(drizzle, worker, queueId);

export const autoTranslateWorker = worker;
