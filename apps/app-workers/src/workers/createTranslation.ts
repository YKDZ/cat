import {
  document,
  eq,
  getDrizzleDB,
  memoryItem,
  translatableElement,
  translatableString,
  translation as translationTable,
} from "@cat/db";
import { PluginRegistry } from "@cat/plugin-core";
import * as z from "zod/v4";
import {
  assertFirstNonNullish,
  assertSingleNonNullish,
} from "@cat/shared/utils";
import { createStringFromData } from "@cat/app-server-shared/utils";
import { defineWorker } from "@/utils";

const { client: drizzle } = await getDrizzleDB();

const id = "create-translation";

declare module "../core/registry" {
  interface WorkerInputTypeMap {
    [id]: CreateTranslationInput;
  }
}

const CreateTranslationInputSchema = z.object({
  translationValue: z.string(),
  translationLanguageId: z.string(),
  elementId: z.number(),
  creatorId: z.uuidv7(),
  createMemory: z.boolean(),
  memoryIds: z.array(z.uuidv7()),
});

type CreateTranslationInput = z.infer<typeof CreateTranslationInputSchema>;

/**
 * 获取元素的源字符串 ID
 */
async function getElementSourceStringId(
  elementId: number,
): Promise<{ stringId: number }> {
  return assertSingleNonNullish(
    await drizzle
      .select({
        stringId: translatableString.id,
      })
      .from(translatableElement)
      .innerJoin(
        translatableString,
        eq(translatableElement.translatableStringId, translatableString.id),
      )
      .innerJoin(document, eq(translatableElement.documentId, document.id))
      .where(eq(translatableElement.id, elementId)),
    `Element ${elementId} not found`,
  );
}

/**
 * 创建翻译并可选地添加到记忆库
 */
async function createTranslationWithMemory(
  input: CreateTranslationInput,
  sourceStringId: number,
  pluginRegistry: PluginRegistry,
): Promise<{ translationId: number; translationStringId: number }> {
  const {
    translationValue,
    translationLanguageId,
    elementId,
    creatorId,
    createMemory,
    memoryIds,
  } = input;

  // 获取向量存储和向量化服务
  const vectorStorage = assertFirstNonNullish(
    pluginRegistry.getPluginServices("VECTOR_STORAGE"),
  );
  const vectorStorageId = await pluginRegistry.getPluginServiceDbId(
    drizzle,
    vectorStorage.record,
  );

  const vectorizer = assertFirstNonNullish(
    pluginRegistry.getPluginServices("TEXT_VECTORIZER"),
  );
  const vectorizerId = await pluginRegistry.getPluginServiceDbId(
    drizzle,
    vectorizer.record,
  );

  return await drizzle.transaction(async (tx) => {
    // 创建翻译字符串并生成向量
    const stringId = assertSingleNonNullish(
      await createStringFromData(
        tx,
        vectorizer.service,
        vectorizerId,
        vectorStorage.service,
        vectorStorageId,
        [{ value: translationValue, languageId: translationLanguageId }],
      ),
    );

    // 创建翻译记录
    const translation = assertSingleNonNullish(
      await tx
        .insert(translationTable)
        .values([
          {
            translatorId: creatorId,
            translatableElementId: elementId,
            stringId,
          },
        ])
        .returning({
          id: translationTable.id,
        }),
    );

    // 如果需要，添加到记忆库
    if (createMemory && memoryIds.length > 0) {
      await tx.insert(memoryItem).values(
        memoryIds.map((memoryId) => ({
          sourceStringId: sourceStringId,
          translationStringId: stringId,
          sourceElementId: elementId,
          translationId: translation.id,
          memoryId,
          creatorId,
        })),
      );
    }

    return {
      translationId: translation.id,
      translationStringId: stringId,
    };
  });
}

const createTranslationWorker = defineWorker({
  id,
  inputSchema: CreateTranslationInputSchema,

  async execute({ input, pluginRegistry }) {
    const { elementId } = input;

    // 获取源字符串 ID
    const element = await getElementSourceStringId(elementId);

    // 创建翻译（可能包含记忆库）
    const result = await createTranslationWithMemory(
      input,
      element.stringId,
      pluginRegistry,
    );

    return {
      ...result,
      elementId,
      memoryCreated: input.createMemory,
      memoryCount: input.memoryIds.length,
    };
  },
});

export default {
  workers: {
    createTranslationWorker,
  },
} as const;
