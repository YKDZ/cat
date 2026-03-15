import { getDrizzleDB } from "@cat/db";
import {
  addGlossaryTermToConcept,
  createInProcessCollector,
  domainEventBus,
  executeCommand,
} from "@cat/domain";
import {
  TermStatusValues,
  TermTypeValues,
} from "@cat/shared/schema/drizzle/enum";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

export const AddTermToConceptInputSchema = z.object({
  conceptId: z.int(),
  text: z.string(),
  languageId: z.string(),
  type: z.enum(TermTypeValues).optional().default("NOT_SPECIFIED"),
  status: z.enum(TermStatusValues).optional().default("PREFERRED"),
  creatorId: z.uuidv4().optional(),
});

export const AddTermToConceptOutputSchema = z.object({
  termId: z.int(),
});

export type AddTermToConceptInput = z.infer<typeof AddTermToConceptInputSchema>;
export type AddTermToConceptOutput = z.infer<
  typeof AddTermToConceptOutputSchema
>;

/**
 * 向已有 termConcept 添加一条术语条目。
 *
 * 写入完成后由领域事件处理器自动触发概念重向量化（术语列表变化会影响向量化文本）。
 */
export const addTermToConceptOp = async (
  data: AddTermToConceptInput,
  ctx?: OperationContext,
): Promise<AddTermToConceptOutput> => {
  void ctx;
  const { client: drizzle } = await getDrizzleDB();
  const collector = createInProcessCollector(domainEventBus);

  const termResult = await drizzle.transaction(async (tx) => {
    return executeCommand(
      { db: tx, collector },
      addGlossaryTermToConcept,
      data,
    );
  });

  await collector.flush();

  return { termId: termResult.termId };
};
