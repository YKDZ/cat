import { getDrizzleDB, term as termTable } from "@cat/db";
import {
  TermStatusValues,
  TermTypeValues,
} from "@cat/shared/schema/drizzle/enum";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { triggerConceptRevectorize } from "./trigger-revectorize";

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
 * 写入完成后自动触发 fire-and-forget 的概念重向量化（术语列表变化会影响向量化文本）。
 */
export const addTermToConceptOp = async (
  data: AddTermToConceptInput,
  ctx?: OperationContext,
): Promise<AddTermToConceptOutput> => {
  const { client: drizzle } = await getDrizzleDB();

  const [termResult] = await drizzle
    .insert(termTable)
    .values({
      termConceptId: data.conceptId,
      text: data.text,
      languageId: data.languageId,
      type: data.type,
      status: data.status,
      creatorId: data.creatorId ?? null,
    })
    .returning({ id: termTable.id });

  triggerConceptRevectorize(data.conceptId, ctx);

  return { termId: termResult.id };
};
