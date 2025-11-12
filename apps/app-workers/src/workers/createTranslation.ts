/**
 * 创建翻译 Worker (重构版)
 *
 * 功能：为可翻译元素创建翻译，可选择性地添加到记忆库
 */

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
): Promise<{ translationId: number; translationStringId: number }> {
  const {
    translationValue,
    translationLanguageId,
    elementId,
    creatorId,
    createMemory,
    memoryIds,
  } = input;

  const pluginRegistry = PluginRegistry.get("GLOBAL", "");

  // 获取向量存储和向量化服务
  const vectorStorage = assertFirstNonNullish(
    await pluginRegistry.getPluginServices(drizzle, "VECTOR_STORAGE"),
  );

  const vectorizer = assertFirstNonNullish(
    await pluginRegistry.getPluginServices(drizzle, "TEXT_VECTORIZER"),
  );

  return await drizzle.transaction(async (tx) => {
    // 创建翻译字符串并生成向量
    const stringId = assertSingleNonNullish(
      await createStringFromData(
        tx,
        vectorizer.service,
        vectorizer.id,
        vectorStorage.service,
        vectorStorage.id,
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

export const createTranslationWorker = defineWorker({
  id,
  taskType: id,
  inputSchema: CreateTranslationInputSchema,

  async execute(ctx) {
    const { elementId } = ctx.input;

    // 获取源字符串 ID
    const element = await getElementSourceStringId(elementId);

    // 创建翻译（可能包含记忆库）
    const result = await createTranslationWithMemory(
      ctx.input,
      element.stringId,
    );

    return {
      ...result,
      elementId,
      memoryCreated: ctx.input.createMemory,
      memoryCount: ctx.input.memoryIds.length,
    };
  },
});
