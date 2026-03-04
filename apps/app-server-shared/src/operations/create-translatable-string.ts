import { getDrizzleDB } from "@cat/db";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { vectorizeToChunkSetOp } from "@/operations/vectorize";
import { createStringFromData } from "@/utils";

export const CreateTranslatableStringInputSchema = z.object({
  data: z.array(
    z.object({
      text: z.string(),
      languageId: z.string(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateTranslatableStringOutputSchema = z.object({
  stringIds: z.array(z.int()),
});

export type CreateTranslatableStringInput = z.infer<
  typeof CreateTranslatableStringInputSchema
>;
export type CreateTranslatableStringOutput = z.infer<
  typeof CreateTranslatableStringOutputSchema
>;

/**
 * 创建可翻译字符串
 *
 * 先向量化文本数据，然后在数据库中创建 TranslatableString 行。
 */
export const createTranslatableStringOp = async (
  data: CreateTranslatableStringInput,
  ctx?: OperationContext,
): Promise<CreateTranslatableStringOutput> => {
  const { client: drizzle } = await getDrizzleDB();

  if (data.data.length === 0) return { stringIds: [] };

  // 直接调用 vectorizeToChunkSetOp
  const { chunkSetIds } = await vectorizeToChunkSetOp(
    {
      data: data.data,
      vectorizerId: data.vectorizerId,
      vectorStorageId: data.vectorStorageId,
    },
    ctx,
  );

  const stringIds = await drizzle.transaction(async (tx) => {
    return await createStringFromData(tx, chunkSetIds, data.data);
  });

  return { stringIds };
};
