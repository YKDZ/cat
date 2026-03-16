import type { OperationContext } from "@cat/domain";

import { getDbHandle } from "@cat/domain";
import {
  createInProcessCollector,
  deleteGlossaryTerm,
  domainEventBus,
  executeCommand,
} from "@cat/domain";
import * as z from "zod";

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
 * 删除术语后由领域事件处理器自动触发概念重向量化。
 */
export const deleteTermOp = async (
  data: DeleteTermInput,
  ctx?: OperationContext,
): Promise<DeleteTermOutput> => {
  void ctx;
  const { client: drizzle } = await getDbHandle();
  const collector = createInProcessCollector(domainEventBus);

  const result = await drizzle.transaction(async (tx) => {
    return executeCommand({ db: tx, collector }, deleteGlossaryTerm, data);
  });

  await collector.flush();

  return { deleted: result.deleted, conceptId: result.conceptId };
};
