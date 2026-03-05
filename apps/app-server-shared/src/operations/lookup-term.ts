import { getDrizzleDB } from "@cat/db";
import * as z from "zod";

import type { OperationContext } from "@/operations/types";

import { lookupTerms } from "@/utils";

/**
 * @module lookup-term
 *
 * **快速词汇术语查找（基于 SQL ILIKE）**
 *
 * 直接通过双向 `ILIKE` 对比从数据库中检索术语表条目，无需 LLM 或向量服务。
 * 适用于输入为明确术语名称或短关键词的场景。
 */

export const LookupTermInputSchema = z.object({
  glossaryIds: z.array(z.uuidv4()).meta({
    description: "UUIDs of the glossaries to search in.",
  }),
  text: z.string(),
  sourceLanguageId: z.string(),
  translationLanguageId: z.string(),
});

export const LookupTermOutputSchema = z.object({
  terms: z.array(
    z.object({
      term: z.string(),
      translation: z.string(),
      definition: z.string().nullable(),
    }),
  ),
});

export type LookupTermInput = z.infer<typeof LookupTermInputSchema>;
export type LookupTermOutput = z.infer<typeof LookupTermOutputSchema>;

export const lookupTermOp = async (
  data: LookupTermInput,
  _ctx?: OperationContext,
): Promise<LookupTermOutput> => {
  if (data.glossaryIds.length === 0) return { terms: [] };

  const { client: drizzle } = await getDrizzleDB();

  const results = await lookupTerms(drizzle, data);

  return {
    terms: results.map((r) => ({
      term: r.term,
      translation: r.translation,
      definition: r.definition,
    })),
  };
};
