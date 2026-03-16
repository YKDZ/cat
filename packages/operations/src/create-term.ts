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
 * 创建术语
 *
 * 直接存储术语文本（text + languageId），然后为每个 termConcept
 * 构建结构化向量化文本并向量化。
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
