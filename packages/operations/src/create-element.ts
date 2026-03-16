import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { createElements, executeCommand } from "@cat/domain";
import { zip } from "@cat/shared/utils";
import * as z from "zod";

import { createTranslatableStringOp } from "./create-translatable-string";

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
 * 创建可翻译元素
 *
 * 先创建 TranslatableString（含向量化），然后插入 TranslatableElement 行。
 */
export const createElementOp = async (
  data: CreateElementInput,
  ctx?: OperationContext,
): Promise<CreateElementOutput> => {
  const { client: drizzle } = await getDbHandle();

  // 直接调用 createTranslatableStringOp
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
