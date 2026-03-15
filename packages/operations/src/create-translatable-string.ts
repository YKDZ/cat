import type { OperationContext } from "@cat/domain";

import { getDrizzleDB } from "@cat/db";
import { createTranslatableStrings, executeCommand } from "@cat/domain";
import { UnvectorizedTextData } from "@cat/shared/schema/misc";
import * as z from "zod";

import { vectorizeToChunkSetOp } from "./vectorize";

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

const createStringIdsFromData = async (
  data: UnvectorizedTextData[],
  vectorizerId: number,
  vectorStorageId: number,
  ctx?: OperationContext,
): Promise<number[]> => {
  if (data.length === 0) return [];

  const { client: drizzle } = await getDrizzleDB();
  const { chunkSetIds } = await vectorizeToChunkSetOp(
    {
      data,
      vectorizerId,
      vectorStorageId,
    },
    ctx,
  );

  return drizzle.transaction(async (tx) => {
    return executeCommand({ db: tx }, createTranslatableStrings, {
      chunkSetIds,
      data,
    });
  });
};

/**
 * 创建可翻译字符串
 *
 * 先向量化文本数据，然后在数据库中创建 TranslatableString 行。
 */
export const createTranslatableStringOp = async (
  data: CreateTranslatableStringInput,
  ctx?: OperationContext,
): Promise<CreateTranslatableStringOutput> => {
  if (data.data.length === 0) return { stringIds: [] };

  const stringIds = await createStringIdsFromData(
    data.data,
    data.vectorizerId,
    data.vectorStorageId,
    ctx,
  );

  return { stringIds };
};
