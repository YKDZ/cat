import type { OperationContext } from "@cat/domain";

import { getDrizzleDB } from "@cat/db";
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
 * 更新 termConcept 的定义和/或 M:N 主题关联。
 *
 * 写入完成后由领域事件处理器自动触发概念重向量化。
 */
export const updateConceptOp = async (
  data: UpdateConceptInput,
  ctx?: OperationContext,
): Promise<UpdateConceptOutput> => {
  void ctx;
  const { client: drizzle } = await getDrizzleDB();
  const collector = createInProcessCollector(domainEventBus);

  const result = await drizzle.transaction(async (tx) => {
    return executeCommand({ db: tx, collector }, updateGlossaryConcept, data);
  });

  await collector.flush();

  return { updated: result.updated };
};
