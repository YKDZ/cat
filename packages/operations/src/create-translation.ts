import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  createInProcessCollector,
  createTranslations,
  domainEventBus,
  executeCommand,
} from "@cat/domain";
import { zip } from "@cat/shared/utils";
import * as z from "zod";

import { createVectorizedStringOp } from "./create-vectorized-string";
import { insertMemory } from "./memory";
import { qaTranslationOp } from "./qa-translation";

export const CreateTranslationInputSchema = z.object({
  data: z.array(
    z.object({
      translatableElementId: z.int(),
      translatorId: z.uuidv4().optional(),
      text: z.string(),
      languageId: z.string(),
      meta: z.json().optional(),
    }),
  ),
  translatorId: z.uuidv4().nullable(),
  memoryIds: z.array(z.uuidv4()).default([]),
  vectorizerId: z.int().optional(),
  vectorStorageId: z.int().optional(),
  documentId: z.uuidv4(),
});

export const CreateTranslationOutputSchema = z.object({
  translationIds: z.array(z.int()),
  memoryItemIds: z.array(z.int()),
});

export const CreateTranslationPubPayloadSchema = z.object({
  translationIds: z.array(z.int()),
});

export type CreateTranslationInput = z.infer<
  typeof CreateTranslationInputSchema
>;
export type CreateTranslationOutput = z.infer<
  typeof CreateTranslationOutputSchema
>;
export type CreateTranslationPubPayload = z.infer<
  typeof CreateTranslationPubPayloadSchema
>;

/**
 * @zh 创建翻译记录。
 *
 * 1. 创建可翻译字符串（向量服务可用时会异步排队向量化）
 * 2. 插入翻译记录
 * 3. 通过领域事件触发可选发布通知
 * 4. 可选写入翻译记忆
 * 5. 对每条翻译执行 QA 检查
 * @en Create translation records.
 *
 * 1. Create translatable strings (enqueue vectorization when services are available)
 * 2. Insert translation records
 * 3. Trigger optional publish notification via domain event
 * 4. Optionally write to translation memory
 * 5. Run QA checks for every created translation
 *
 * @param data - {@zh 翻译创建输入参数} {@en Translation creation input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 新创建的翻译 ID 列表区记忆条目 ID 列表} {@en List of created translation IDs and memory item IDs}
 */
export const createTranslationOp = async (
  data: CreateTranslationInput,
  ctx?: OperationContext,
): Promise<CreateTranslationOutput> => {
  const { client: drizzle } = await getDbHandle();
  const traceId = ctx?.traceId ?? crypto.randomUUID();

  // 1. 创建可翻译字符串
  const stringResult = await createVectorizedStringOp(
    {
      data: data.data.map((d) => ({
        text: d.text,
        languageId: d.languageId,
      })),
      vectorizerId: data.vectorizerId,
      vectorStorageId: data.vectorStorageId,
    },
    ctx,
  );

  // 2. 插入翻译记录
  const collector = createInProcessCollector(domainEventBus);

  const translationIds = await executeCommand(
    { db: drizzle, collector },
    createTranslations,
    {
      data: Array.from(zip(data.data, stringResult.stringIds)).map(
        ([item, stringId]) => ({
          translatableElementId: item.translatableElementId,
          translatorId: item.translatorId,
          meta: item.meta,
          stringId,
        }),
      ),
      documentId: data.documentId,
    },
  );

  await collector.flush();

  // 4. 可选写入翻译记忆
  let memoryItemIds: number[] | undefined;

  if (data.memoryIds.length > 0) {
    await drizzle.transaction(async (tx) => {
      memoryItemIds = (await insertMemory(tx, data.memoryIds, translationIds))
        .memoryItemIds;
    });
  }

  // 5. 对每条翻译执行 QA 检查
  await Promise.all(
    translationIds.map(
      async (id) => await qaTranslationOp({ translationId: id }, { traceId }),
    ),
  );

  return {
    translationIds,
    memoryItemIds: memoryItemIds ?? [],
  };
};
