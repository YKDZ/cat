import { contextEvidence, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetContextEvidenceQuerySchema = z.object({
  id: z.int(),
});
export type GetContextEvidenceQuery = z.infer<
  typeof GetContextEvidenceQuerySchema
>;

/**
 * @zh 按 ID 获取单条 ContextEvidence 记录。
 * @en Fetch a single ContextEvidence row by ID.
 */
export const getContextEvidence: Query<
  GetContextEvidenceQuery,
  typeof contextEvidence.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(contextEvidence)
    .where(eq(contextEvidence.id, query.id))
    .limit(1);
  return rows[0] ?? null;
};
