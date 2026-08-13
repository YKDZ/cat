import {
  ensurePersonalProjectMemory,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import {
  RecallDerivationReferenceSchema,
  type RecallDerivationReference,
} from "@cat/shared";
import * as z from "zod";

import { insertMemory } from "./memory.ts";

export const WritePersonalTranslationMemoryInputSchema = z.object({
  translationIds: z.array(z.int()).min(1),
  userId: z.uuidv4(),
  projectId: z.uuidv4(),
});

export type WritePersonalTranslationMemoryInput = z.infer<
  typeof WritePersonalTranslationMemoryInputSchema
>;

export const WritePersonalTranslationMemoryOutputSchema = z.object({
  memoryId: z.uuidv4(),
  memoryItemIds: z.array(z.int()),
  derivations: z.array(RecallDerivationReferenceSchema),
});

export type WritePersonalTranslationMemoryOutput = z.infer<
  typeof WritePersonalTranslationMemoryOutputSchema
>;

export const writePersonalTranslationMemoryOp = async (
  input: WritePersonalTranslationMemoryInput,
): Promise<WritePersonalTranslationMemoryOutput> => {
  const { client: db } = await getDbHandle();

  const ensured = await executeCommand({ db }, ensurePersonalProjectMemory, {
    userId: input.userId,
    projectId: input.projectId,
  });

  const inserted = await insertMemory(
    db,
    [ensured.memoryId],
    input.translationIds,
  );

  return {
    memoryId: ensured.memoryId,
    memoryItemIds: inserted.memoryItemIds,
    derivations: inserted.derivations satisfies RecallDerivationReference[],
  };
};
