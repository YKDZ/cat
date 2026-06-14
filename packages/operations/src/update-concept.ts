import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  createInProcessCollector,
  domainEventBus,
  executeCommand,
  updateGlossaryConcept,
} from "@cat/domain";
import * as z from "zod";

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
 *
 * 写入完成后由领域事件处理器自动触发概念重向量化。
 * Update the definition and/or M:N subject associations of a termConcept.
 *
 * After the write completes, the domain event handler automatically
 * triggers concept re-vectorization.
 *
 * @param data - Concept update input parameters
 * @param ctx - Operation context
 * @returns - Whether any update was applied
 */
export const updateConceptOp = async (
  data: UpdateConceptInput,
  ctx?: OperationContext,
): Promise<UpdateConceptOutput> => {
  void ctx;
  const { client: drizzle } = await getDbHandle();
  const collector = createInProcessCollector(domainEventBus);

  const result = await drizzle.transaction(async (tx) => {
    return executeCommand({ db: tx, collector }, updateGlossaryConcept, data);
  });

  await collector.flush();

  return { updated: result.updated };
};
