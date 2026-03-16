import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  executeCommand,
  executeQuery,
  getConceptVectorizationSnapshot,
  noopCollector,
  setConceptStringId,
} from "@cat/domain";
import { buildConceptVectorizationText } from "@cat/domain";
import * as z from "zod";

import { createTranslatableStringOp } from "./create-translatable-string";

export const RevectorizeConceptInputSchema = z.object({
  conceptId: z.int(),
  vectorizerId: z.int(),
  vectorStorageId: z.int(),
});

export const RevectorizeConceptOutputSchema = z.object({
  skipped: z.boolean(),
});

export type RevectorizeConceptInput = z.infer<
  typeof RevectorizeConceptInputSchema
>;
export type RevectorizeConceptOutput = z.infer<
  typeof RevectorizeConceptOutputSchema
>;

/**
 * 重新向量化 termConcept 的结构化描述文本。
 *
 * 构建新的向量化文本 → 与 `translatableString.value` 比对 →
 * 相同则跳过（去重），否则向量化并更新 `termConcept.stringId`。
 */
export const revectorizeConceptOp = async (
  data: RevectorizeConceptInput,
  ctx?: OperationContext,
): Promise<RevectorizeConceptOutput> => {
  const { client: drizzle } = await getDbHandle();

  const newText = await buildConceptVectorizationText(drizzle, data.conceptId);

  // Fetch current stringId and its text
  const conceptSnapshot = await executeQuery(
    { db: drizzle },
    getConceptVectorizationSnapshot,
    {
      conceptId: data.conceptId,
    },
  );
  if (!conceptSnapshot) return { skipped: true };

  const oldText = conceptSnapshot.text;

  // Dedup: skip if text hasn't changed
  if (newText === oldText) return { skipped: true };

  // Case: newText is null but oldText was set → clear concept.stringId
  if (newText === null && oldText !== null) {
    await executeCommand(
      { db: drizzle, collector: noopCollector },
      setConceptStringId,
      {
        conceptId: data.conceptId,
        stringId: null,
      },
    );
    return { skipped: false };
  }

  // Case: newText is non-null (either new or changed) → vectorize and update
  if (newText !== null) {
    const { stringIds } = await createTranslatableStringOp(
      {
        data: [{ text: newText, languageId: "mul" }],
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.vectorStorageId,
      },
      ctx,
    );
    const [stringId] = stringIds;

    await executeCommand(
      { db: drizzle, collector: noopCollector },
      setConceptStringId,
      {
        conceptId: data.conceptId,
        stringId,
      },
    );
  }

  return { skipped: false };
};
