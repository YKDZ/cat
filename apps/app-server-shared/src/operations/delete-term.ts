import { eq, getDrizzleDB, term as termTable } from "@cat/db";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { triggerConceptRevectorize } from "./trigger-revectorize";

export const DeleteTermInputSchema = z.object({
  termId: z.int(),
});

export const DeleteTermOutputSchema = z.object({
  deleted: z.boolean(),
  conceptId: z.int().nullable(),
});

export type DeleteTermInput = z.infer<typeof DeleteTermInputSchema>;
export type DeleteTermOutput = z.infer<typeof DeleteTermOutputSchema>;

/**
 * 删除一条术语条目。
 *
 * 先查询所属 conceptId，删除术语后自动触发 fire-and-forget 的概念重向量化。
 */
export const deleteTermOp = async (
  data: DeleteTermInput,
  ctx?: OperationContext,
): Promise<DeleteTermOutput> => {
  const { client: drizzle } = await getDrizzleDB();

  // 先查询 conceptId（删除后就查不到了）
  const termRow = await drizzle
    .select({ termConceptId: termTable.termConceptId })
    .from(termTable)
    .where(eq(termTable.id, data.termId))
    .limit(1);

  if (termRow.length === 0) {
    return { deleted: false, conceptId: null };
  }

  const conceptId = termRow[0].termConceptId;

  await drizzle.delete(termTable).where(eq(termTable.id, data.termId));

  triggerConceptRevectorize(conceptId, ctx);

  return { deleted: true, conceptId };
};
