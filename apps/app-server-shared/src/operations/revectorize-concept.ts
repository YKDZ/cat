import { eq, getDrizzleDB, termConcept, translatableString } from "@cat/db";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { vectorizeToChunkSetOp } from "@/operations/vectorize";
import { buildConceptVectorizationText, createStringFromData } from "@/utils";

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
  const { client: drizzle } = await getDrizzleDB();

  const newText = await buildConceptVectorizationText(drizzle, data.conceptId);

  // Fetch current stringId and its text
  const conceptRow = await drizzle
    .select({ stringId: termConcept.stringId })
    .from(termConcept)
    .where(eq(termConcept.id, data.conceptId))
    .limit(1);

  if (conceptRow.length === 0) return { skipped: true };

  const currentStringId = conceptRow[0].stringId;
  let oldText: string | null = null;

  if (currentStringId !== null) {
    const existingString = await drizzle
      .select({ value: translatableString.value })
      .from(translatableString)
      .where(eq(translatableString.id, currentStringId))
      .limit(1);

    oldText = existingString.length > 0 ? existingString[0].value : null;
  }

  // Dedup: skip if text hasn't changed
  if (newText === oldText) return { skipped: true };

  // Case: newText is null but oldText was set → clear concept.stringId
  if (newText === null && oldText !== null) {
    await drizzle
      .update(termConcept)
      .set({ stringId: null })
      .where(eq(termConcept.id, data.conceptId));
    return { skipped: false };
  }

  // Case: newText is non-null (either new or changed) → vectorize and update
  if (newText !== null) {
    const { chunkSetIds } = await vectorizeToChunkSetOp(
      {
        data: [{ text: newText, languageId: "mul" }],
        vectorizerId: data.vectorizerId,
        vectorStorageId: data.vectorStorageId,
      },
      ctx,
    );

    await drizzle.transaction(async (tx) => {
      const [stringId] = await createStringFromData(tx, chunkSetIds, [
        { text: newText, languageId: "mul" },
      ]);

      await tx
        .update(termConcept)
        .set({ stringId })
        .where(eq(termConcept.id, data.conceptId));
    });
  }

  return { skipped: false };
};
