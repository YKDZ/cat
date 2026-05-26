import {
  ensurePersonalProjectMemory,
  executeCommand,
  getDbHandle,
} from "@cat/domain";
import * as z from "zod";

import { insertMemory } from "./memory";

export const WritePersonalTranslationMemoryInputSchema = z.object({
  translationIds: z.array(z.int()).min(1),
  userId: z.uuidv4(),
  projectId: z.uuidv4(),
});

export type WritePersonalTranslationMemoryInput = z.infer<
  typeof WritePersonalTranslationMemoryInputSchema
>;

export type WritePersonalTranslationMemoryOutput = {
  memoryId: string;
  memoryItemIds: number[];
};

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
  };
};
