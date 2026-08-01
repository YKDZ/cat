import type { OperationContext } from "@cat/domain";
import { getDbHandle } from "@cat/domain";
import { createGlossaryTerms, executeCommand } from "@cat/domain";
import { ServiceImplementationReferenceSchema } from "@cat/shared";
import { TermDataSchema } from "@cat/shared";
import * as z from "zod";

import { revectorizeConceptOp } from "./revectorize-concept.ts";

export const CreateTermInputSchema = z.object({
  glossaryId: z.uuidv4(),
  creatorId: z.uuidv4().optional(),
  data: z.array(TermDataSchema),
  vectorizer: ServiceImplementationReferenceSchema,
  vectorStorage: ServiceImplementationReferenceSchema,
});

export const CreateTermOutputSchema = z.object({
  termIds: z.array(z.int()),
});

export type CreateTermInput = z.infer<typeof CreateTermInputSchema>;
export type CreateTermOutput = z.infer<typeof CreateTermOutputSchema>;

/**
 *
 * 直接存储术语文本（text + languageId），然后为每个 termConcept
 * 构建结构化向量化文本并向量化。
 * Create term entries.
 *
 * Directly stores term text (text + languageId), then builds the
 * structured vectorization text for each termConcept and vectorizes it.
 *
 * @param data - Term creation input parameters
 * @param ctx - Operation context
 * @returns - List of IDs of the newly created terms
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
          vectorizer: data.vectorizer,
          vectorStorage: data.vectorStorage,
        },
        ctx,
      );
    }),
  );

  return { termIds };
};
