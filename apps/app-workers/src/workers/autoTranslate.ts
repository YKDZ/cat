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
  translatableElement,
  translatableString,
  chunkSet,
  chunk,
  aliasedTable,
  termEntry,
} from "@cat/db";
import type {
  IVectorStorage,
  TermExtractor,
  TermRecognizer,
  TranslationAdvisor,
} from "@cat/plugin-core";
import * as z from "zod/v4";
import {
  createStringFromData,
  getServiceFromDBId,
  searchMemory,
} from "@cat/app-server-shared/utils";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
  logger,
} from "@cat/shared/utils";
import { defineFlow, defineWorker } from "@/utils";

const { client: drizzle } = await getDrizzleDB();

const id = "auto-translate";
const name = "Auto Translate";

const AutoTranslateInputSchema = z.object({
  userId: z.uuidv4(),
  documentId: z.uuidv4(),
  advisorId: z.int(),
  languageId: z.string(),
  minMemorySimilarity: z.number().min(0).max(1),
});

type AutoTranslateInput = z.infer<typeof AutoTranslateInputSchema>;

const TranslateElementChunkInputSchema = z.object({
  elementIds: z.array(z.int()),
  documentId: z.uuidv4(),
  userId: z.uuidv4(),
  advisorId: z.int(),
  languageId: z.string(),
  minMemorySimilarity: z.number().min(0).max(1),
  projectId: z.uuidv4(),
  glossaryIds: z.array(z.uuidv4()),
  memoryIds: z.array(z.uuidv4()),
});

type TranslateElementChunkInput = z.infer<
  typeof TranslateElementChunkInputSchema
>;

const FinalizeInputSchema = z.object({
  documentId: z.uuidv4(),
  languageId: z.string(),
  totalElements: z.number(),
});

const FinalizeOutputSchema = z.object({
  documentId: z.uuidv4(),
  languageId: z.string(),
  totalElements: z.number(),
  totalTranslated: z.number(),
  chunksProcessed: z.number(),
});

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [id]: AutoTranslateInput;
    "translate-elements-chunk": TranslateElementChunkInput;
  }

  interface FlowInputTypeMap {
    "auto-translate-flow": AutoTranslateInput;
  }
}

interface ElementData {
  id: number;
  value: string;
  languageId: string;
  chunkIds: number[];
}

interface TranslationData {
  value: string;
  translatorId: string;
  translatableElementId: number;
  languageId: string;
  meta: {
    memorySimilarity: number | null;
    memoryId: string | null;
    memoryItemId: number | null;
    advisorId: number | null;
  };
}

/**
 * 验证文档和目标语言
 */
async function validateDocumentAndLanguage(
  documentId: string,
  languageId: string,
) {
  const document = assertSingleNonNullish(
    await drizzle
      .select({
        id: documentTable.id,
        projectId: documentTable.projectId,
      })
      .from(documentTable)
      .where(eq(documentTable.id, documentId)),
    "Document not found",
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

  if (targetLangRows.length === 0) {
    throw new Error("Language is not configured in project");
  }

  return document;
}

/**
 * 获取项目相关的术语库和记忆库
 */
async function getProjectResources(projectId: string) {
  const glossaryIds: string[] = (
    await drizzle
      .select({ glossaryId: glossaryToProject.glossaryId })
      .from(glossaryToProject)
      .where(eq(glossaryToProject.projectId, projectId))
  ).map((r) => r.glossaryId);

  const memoryIds: string[] = (
    await drizzle
      .select({ memoryId: memoryToProject.memoryId })
      .from(memoryToProject)
      .where(eq(memoryToProject.projectId, projectId))
  ).map((r) => r.memoryId);

  return { glossaryIds, memoryIds };
}

/**
 * 获取文档元素
 */
async function getDocumentElements(documentId: string): Promise<ElementData[]> {
  return await drizzle
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
}

/**
 * 使用记忆库翻译元素
 */
async function translateWithMemory(
  element: ElementData,
  targetLanguageId: string,
  memoryIds: string[],
  minSimilarity: number,
  vectorStorage: IVectorStorage,
  userId: string,
): Promise<TranslationData | null> {
  const chunks = await vectorStorage.retrieve(element.chunkIds);

  if (!chunks) {
    logger.warn("PROCESSOR", {
      msg: `No embeddings found for element ${element.id}`,
    });
    return null;
  }

  const embeddings = chunks.map((chunk) => chunk.vector);

  const memories = await searchMemory(
    drizzle,
    vectorStorage,
    embeddings,
    element.languageId,
    targetLanguageId,
    memoryIds,
    minSimilarity,
  );

  if (memories.length === 0) return null;

  // 使用相似度最高的记忆
  const memory = assertFirstNonNullish(
    memories.sort((a, b) => b.similarity - a.similarity),
  );

  return {
    value: memory.translation,
    translatorId: userId,
    translatableElementId: element.id,
    languageId: targetLanguageId,
    meta: {
      memorySimilarity: memory.similarity,
      memoryId: memory.memoryId,
      memoryItemId: memory.id,
      advisorId: null,
    },
  };
}

const translateWithAdvisor = async (
  element: ElementData,
  targetLanguageId: string,
  advisor: TranslationAdvisor,
  advisorId: number,
  glossaryIds: string[],
  termExtractor: TermExtractor,
  termRecognizer: TermRecognizer,
  userId: string,
): Promise<TranslationData | null> => {
  if (!advisor.canSuggest(element.languageId, targetLanguageId)) {
    logger.warn("PROCESSOR", {
      msg: `Advisor cannot translate from ${element.languageId} to ${targetLanguageId}`,
    });
    return null;
  }

  // 获取术语化文本
  const termCandidates = await termExtractor.extract(
    element.value,
    element.languageId,
  );

  const recognizedTerms = await termRecognizer.recognize(
    {
      text: element.value,
      candidates: termCandidates,
    },
    element.languageId,
  );

  const termEntryIds = recognizedTerms.map((term) => term.termEntryId);

  // 查询术语关系
  const sourceTerm = aliasedTable(term, "sourceTerm");
  const translationTerm = aliasedTable(term, "translationTerm");
  const sourceString = aliasedTable(translatableString, "sourceString");
  const translationString = aliasedTable(
    translatableString,
    "translationString",
  );

  const terms = await drizzle
    .select({
      term: sourceString.value,
      translation: translationString.value,
      subject: termEntry.subject,
    })
    .from(termEntry)
    .innerJoin(sourceTerm, eq(sourceTerm.termEntryId, termEntry.id))
    .innerJoin(translationTerm, eq(sourceTerm.termEntryId, termEntry.id))
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
        eq(translationString.languageId, targetLanguageId),
      ),
    )
    .where(
      and(
        inArray(termEntry.id, termEntryIds),
        inArray(termEntry.glossaryId, glossaryIds),
      ),
    );

  // 获取建议
  const suggestions = await advisor.getSuggestions(
    element.value,
    element.value,
    terms,
    element.languageId,
    targetLanguageId,
  );

  const translation = suggestions.find(({ status }) => status === "SUCCESS");

  if (!translation || translation.status === "ERROR") {
    return null;
  }

  return {
    value: translation.value,
    translatorId: userId,
    translatableElementId: element.id,
    languageId: targetLanguageId,
    meta: {
      advisorId,
      memorySimilarity: null,
      memoryId: null,
      memoryItemId: null,
    },
  };
};

/**
 * 翻译元素分块 Worker
 */
const translateElementsChunkWorker = defineWorker({
  id: "translate-elements-chunk",
  inputSchema: TranslateElementChunkInputSchema,

  async execute({ input, pluginRegistry }) {
    const {
      elementIds,
      userId,
      advisorId,
      languageId,
      minMemorySimilarity,
      glossaryIds,
      memoryIds,
    } = input;

    // 获取服务
    const advisor = await getServiceFromDBId<TranslationAdvisor>(
      drizzle,
      pluginRegistry,
      advisorId,
    );

    const vectorStorage = assertFirstNonNullish(
      pluginRegistry.getPluginServices("VECTOR_STORAGE"),
    );
    const vectorStorageId = await pluginRegistry.getPluginServiceDbId(
      drizzle,
      vectorStorage.record.pluginId,
      vectorStorage.record.id,
    );

    const vectorizer = assertFirstNonNullish(
      pluginRegistry.getPluginServices("TEXT_VECTORIZER"),
    );
    const vectorizerId = await pluginRegistry.getPluginServiceDbId(
      drizzle,
      vectorizer.record.pluginId,
      vectorizer.record.id,
    );

    const { service: termExtractor } = assertFirstNonNullish(
      pluginRegistry.getPluginServices("TERM_EXTRACTOR"),
      `No term extractor installed in ${pluginRegistry.scopeType}:${pluginRegistry.scopeId}`,
    );

    const { service: termRecognizer } = assertFirstNonNullish(
      pluginRegistry.getPluginServices("TERM_RECOGNIZER"),
      `No term recognizer installed in ${pluginRegistry.scopeType}:${pluginRegistry.scopeId}`,
    );

    // 获取元素
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
      .innerJoin(chunkSet, eq(translatableString.chunkSetId, chunkSet.id))
      .leftJoin(chunk, eq(chunk.chunkSetId, chunkSet.id))
      .where(inArray(translatableElement.id, elementIds))
      .groupBy(
        translatableElement.id,
        translatableString.value,
        translatableString.languageId,
      );

    // 翻译元素 - 使用 Promise.all 并行处理
    const translationPromises = elements.map(async (element) => {
      // 尝试使用记忆库
      const memoryTranslation = await translateWithMemory(
        element,
        languageId,
        memoryIds,
        minMemorySimilarity,
        vectorStorage.service,
        userId,
      );

      if (memoryTranslation) {
        return memoryTranslation;
      }

      // 尝试使用建议器
      if (advisor) {
        const advisorTranslation = await translateWithAdvisor(
          element,
          languageId,
          advisor,
          advisorId,
          glossaryIds,
          termExtractor,
          termRecognizer,
          userId,
        );

        if (advisorTranslation) {
          return advisorTranslation;
        }
      }

      return null;
    });

    const translationResults = await Promise.all(translationPromises);
    const translations = translationResults.filter(
      (t): t is TranslationData => t !== null,
    );

    // 创建翻译
    if (translations.length > 0) {
      await drizzle.transaction(async (tx) => {
        const stringIds = await createStringFromData(
          tx,
          vectorizer.service,
          vectorizerId,
          vectorStorage.service,
          vectorStorageId,
          translations.map((item) => ({
            value: item.value,
            languageId: item.languageId,
          })),
        );

        await tx.insert(translationTable).values(
          translations.map((item, index) => ({
            ...item,
            stringId: stringIds[index],
          })),
        );
      });
    }

    return {
      translatedCount: translations.length,
      elementIds: translations.map((t) => t.translatableElementId),
    };
  },

  hooks: {
    onFailed: async (job, error) => {
      logger.error(
        "PROCESSOR",
        {
          msg: "Failed to translate elements chunk",
          jobName: job.name,
          elementCount: TranslateElementChunkInputSchema.parse(job.data)
            .elementIds.length,
        },
        error,
      );
    },
  },
});

/**
 * 最终汇总 Worker
 */
const autoTranslateFinalizeWorker = defineWorker({
  id,
  inputSchema: FinalizeInputSchema,
  outputSchema: FinalizeOutputSchema,

  async execute(ctx) {
    const childrenValues = await ctx.job.getChildrenValues();

    // 汇总所有子任务的结果
    let totalTranslated = 0;
    const translatedElementIds: number[] = [];

    for (const [_, r] of Object.entries(childrenValues)) {
      const result = z
        .object({
          translatedCount: z.int(),
          elementIds: z.array(z.int()),
        })
        .parse(r);

      totalTranslated += result.translatedCount;
      translatedElementIds.push(...result.elementIds);
    }

    logger.info("PROCESSOR", {
      msg: "Auto-translation completed",
      documentId: ctx.input.documentId,
      languageId: ctx.input.languageId,
      totalElements: ctx.input.totalElements,
      totalTranslated,
      chunksProcessed: Object.keys(childrenValues).length,
    });

    return {
      documentId: ctx.input.documentId,
      languageId: ctx.input.languageId,
      totalElements: ctx.input.totalElements,
      totalTranslated,
      translatedElementIds,
      chunksProcessed: Object.keys(childrenValues).length,
    };
  },
});

const autoTranslateFlow = defineFlow({
  id: "auto-translate-flow",
  name,
  inputSchema: AutoTranslateInputSchema,

  async build({ input }) {
    const { documentId, languageId, userId, advisorId, minMemorySimilarity } =
      input;

    // 验证文档和语言
    const document = await validateDocumentAndLanguage(documentId, languageId);

    // 获取项目资源
    const { glossaryIds, memoryIds } = await getProjectResources(
      document.projectId,
    );

    // 获取所有元素
    const elements = await getDocumentElements(documentId);

    if (elements.length === 0) {
      logger.warn("PROCESSOR", {
        msg: "No elements found in document",
        documentId,
      });
    }

    // 将元素分块
    const CHUNK_SIZE = 100;
    const children = [];

    for (let i = 0; i < elements.length; i += CHUNK_SIZE) {
      const chunkElements = elements.slice(i, i + CHUNK_SIZE);
      const chunkIndex = Math.floor(i / CHUNK_SIZE);

      children.push({
        name: `translate-chunk-${chunkIndex}`,
        workerId: "translate-elements-chunk",
        data: {
          elementIds: chunkElements.map((e) => e.id),
          documentId,
          userId,
          advisorId,
          languageId,
          minMemorySimilarity,
          projectId: document.projectId,
          glossaryIds,
          memoryIds,
        },
      });
    }

    // 返回父子结构
    return {
      name: "finalize",
      workerId: "auto-translate-finalize",
      data: {
        documentId,
        languageId,
        totalElements: elements.length,
      },
      children,
    };
  },
});

export default {
  workers: { autoTranslateFinalizeWorker, translateElementsChunkWorker },
  flows: { autoTranslateFlow },
} as const;
