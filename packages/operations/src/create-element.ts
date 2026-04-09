import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { createElements, executeCommand } from "@cat/domain";
import { zip } from "@cat/shared/utils";
import * as z from "zod";

import { createVectorizedStringOp } from "./create-vectorized-string";

export const CreateElementInputSchema = z.object({
  data: z.array(
    z.object({
      meta: z.json().optional(),
      creatorId: z.uuidv4().optional(),
      documentId: z.uuidv4(),
      text: z.string(),
      languageId: z.string(),
      sortIndex: z.int().optional(),
      sourceStartLine: z.int().nullable().optional(),
      sourceEndLine: z.int().nullable().optional(),
      sourceLocationMeta: z.json().nullable().optional(),
    }),
  ),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateElementOutputSchema = z.object({
  elementIds: z.array(z.int()),
});

export type CreateElementInput = z.infer<typeof CreateElementInputSchema>;
export type CreateElementOutput = z.infer<typeof CreateElementOutputSchema>;

/**
 * @zh 创建可翻译元素。
 *
 * 先创建 TranslatableString（含向量化），然后插入 TranslatableElement 行。
 * @en Create translatable elements.
 *
 * First creates TranslatableStrings (with vectorization), then inserts
 * the corresponding TranslatableElement rows.
 *
 * @param data - {@zh 元素创建输入参数} {@en Element creation input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 新创建的元素 ID 列表} {@en List of IDs of the newly created elements}
 */
export const createElementOp = async (
  data: CreateElementInput,
  ctx?: OperationContext,
): Promise<CreateElementOutput> => {
  const { client: drizzle } = await getDbHandle();

  // 直接调用 createVectorizedStringOp
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

  const elementIds = await executeCommand({ db: drizzle }, createElements, {
    data: Array.from(zip(data.data, stringResult.stringIds)).map(
      ([element, stringId]) => ({
        meta: element.meta,
        creatorId: element.creatorId,
        documentId: element.documentId,
        stringId,
        sortIndex: element.sortIndex,
        sourceStartLine: element.sourceStartLine,
        sourceEndLine: element.sourceEndLine,
        sourceLocationMeta: element.sourceLocationMeta,
      }),
    ),
  });

  return {
    elementIds,
  };
};
