import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { createElements, executeCommand } from "@cat/domain";
import { zip } from "@cat/shared";
import * as z from "zod";

import { createVectorizedStringOp } from "./create-vectorized-string";

export const CreateElementInputSchema = z.object({
  data: z.array(
    z.object({
      projectId: z.uuidv4(),
      primaryContentNodeId: z.uuidv4(),
      importerId: z.string().min(1),
      sourceRootRef: z.string().min(1),
      sourceNodeRef: z.string().min(1),
      stableSourceRef: z.string().min(1),
      meta: z.json().optional(),
      creatorId: z.uuidv4().optional(),
      text: z.string(),
      languageId: z.string(),
      localOrder: z.int().optional(),
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
 *
 * 先创建 TranslatableString（含向量化），然后插入 TranslatableElement 行。
 * Create translatable elements.
 *
 * First creates TranslatableStrings (with vectorization), then inserts
 * the corresponding TranslatableElement rows.
 *
 * @param data - Element creation input parameters
 * @param ctx - Operation context
 * @returns - List of IDs of the newly created elements
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
        projectId: element.projectId,
        primaryContentNodeId: element.primaryContentNodeId,
        importerId: element.importerId,
        sourceRootRef: element.sourceRootRef,
        sourceNodeRef: element.sourceNodeRef,
        stableSourceRef: element.stableSourceRef,
        meta: element.meta,
        creatorId: element.creatorId,
        stringId,
        localOrder: element.localOrder,
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
