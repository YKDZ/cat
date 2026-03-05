import { eq, getDrizzleDB, termConcept, termConceptToSubject } from "@cat/db";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { triggerConceptRevectorize } from "./trigger-revectorize";

export const UpdateConceptInputSchema = z.object({
  conceptId: z.int(),
  subjectIds: z.array(z.int()).optional(),
  definition: z.string().optional(),
});

export const UpdateConceptOutputSchema = z.object({
  updated: z.boolean(),
});

export type UpdateConceptInput = z.infer<typeof UpdateConceptInputSchema>;
export type UpdateConceptOutput = z.infer<typeof UpdateConceptOutputSchema>;

/**
 * 更新 termConcept 的定义和/或 M:N 主题关联。
 *
 * 写入完成后自动触发 fire-and-forget 的概念重向量化。
 */
export const updateConceptOp = async (
  data: UpdateConceptInput,
  ctx?: OperationContext,
): Promise<UpdateConceptOutput> => {
  const { client: drizzle } = await getDrizzleDB();

  let changed = false;

  await drizzle.transaction(async (tx) => {
    if (data.subjectIds !== undefined) {
      await tx
        .delete(termConceptToSubject)
        .where(eq(termConceptToSubject.termConceptId, data.conceptId));

      if (data.subjectIds.length > 0) {
        await tx.insert(termConceptToSubject).values(
          data.subjectIds.map((subjectId, index) => ({
            termConceptId: data.conceptId,
            subjectId,
            isPrimary: index === 0,
          })),
        );
      }
      changed = true;
    }

    if (data.definition !== undefined) {
      await tx
        .update(termConcept)
        .set({ definition: data.definition || "" })
        .where(eq(termConcept.id, data.conceptId));
      changed = true;
    }
  });

  if (changed) {
    triggerConceptRevectorize(data.conceptId, ctx);
  }

  return { updated: changed };
};
