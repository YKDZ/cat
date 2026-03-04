import { getDrizzleDB, getRedisDB, translation } from "@cat/db";
import { zip } from "@cat/shared/utils";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { createTranslatableStringOp } from "@/operations/create-translatable-string";
import { qaTranslationOp } from "@/operations/qa-translation";
import { insertMemory } from "@/utils";

export const getCreateTranslationPubKey = (documentId: string): string => {
  return `translation:create:${documentId}`;
};

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
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
  documentId: z.uuidv4().optional(),
  pub: z.boolean().default(false).optional(),
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
 * 创建翻译
 *
 * 1. 创建可翻译字符串（含向量化）
 * 2. 插入翻译记录
 * 3. 可选发布 Redis 通知
 * 4. 可选写入翻译记忆
 * 5. 对每条翻译执行 QA 检查
 */
export const createTranslationOp = async (
  data: CreateTranslationInput,
  ctx?: OperationContext,
): Promise<CreateTranslationOutput> => {
  const { client: drizzle } = await getDrizzleDB();
  const { redisPub } = await getRedisDB();
  const traceId = ctx?.traceId ?? crypto.randomUUID();

  if (data.pub && !data.documentId) {
    throw new Error("documentId must be specified when pub is true");
  }

  // 1. 创建可翻译字符串
  const stringResult = await createTranslatableStringOp(
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
  const translations = await drizzle
    .insert(translation)
    .values(
      Array.from(zip(data.data, stringResult.stringIds)).map(
        ([item, stringId]) => ({
          ...item,
          stringId,
        }),
      ),
    )
    .returning({
      id: translation.id,
    });

  const translationIds = translations.map((t) => t.id);

  // 3. 可选发布 Redis 通知
  if (data.pub && data.documentId) {
    await redisPub.publish(
      getCreateTranslationPubKey(data.documentId),
      JSON.stringify({
        translationIds,
      } satisfies CreateTranslationPubPayload),
    );
  }

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
