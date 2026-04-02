import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import { createGlossaryTerms, executeCommand } from "@cat/domain";
import { TermDataSchema } from "@cat/shared/schema/misc";
import * as z from "zod";

import { revectorizeConceptOp } from "./revectorize-concept";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
});

export type CreateTermInput = z.infer<typeof CreateTermInputSchema>;
export type CreateTermOutput = z.infer<typeof CreateTermOutputSchema>;

/**
 * @zh 创建术语条目。
 *
 * 直接存储术语文本（text + languageId），然后为每个 termConcept
 * 构建结构化向量化文本并向量化。
 * @en Create term entries.
 *
 * Directly stores term text (text + languageId), then builds the
 * structured vectorization text for each termConcept and vectorizes it.
 *
 * @param data - {@zh 术语创建输入参数} {@en Term creation input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 新创建的术语 ID 列表} {@en List of IDs of the newly created terms}
 */
export const createTermOp = async (
  data: CreateTermInput,
  ctx?: OperationContext,
): Promise<CreateTermOutput> => {
  const { client: drizzle } = await getDbHandle();

  const { termIds, conceptIds } = await drizzle.transaction(async (tx) => {
    return executeCommand({ db: tx }, createGlossaryTerms, {
      glossaryId: data.glossaryId,
      creatorId: data.creatorId,
      data: data.data,
    });
  });

  await Promise.all(
    conceptIds.map(async (conceptId) => {
      await revectorizeConceptOp(
        {
          conceptId,
          vectorizerId: data.vectorizerId,
          vectorStorageId: data.vectorStorageId,
        },
        ctx,
      );
    }),
  );

  return { termIds };
};
