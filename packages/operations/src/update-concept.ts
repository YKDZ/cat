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
 * @zh 更新 termConcept 的定义和/或 M:N 主题关联。
 *
 * 写入完成后由领域事件处理器自动触发概念重向量化。
 * @en Update the definition and/or M:N subject associations of a termConcept.
 *
 * After the write completes, the domain event handler automatically
 * triggers concept re-vectorization.
 *
 * @param data - {@zh 概念更新输入参数} {@en Concept update input parameters}
 * @param ctx - {@zh 操作上下文} {@en Operation context}
 * @returns - {@zh 是否执行了更新} {@en Whether any update was applied}
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
