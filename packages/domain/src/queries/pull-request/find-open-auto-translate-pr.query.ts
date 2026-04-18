import { and, eq, notInArray, pullRequest } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const FindOpenAutoTranslatePRQuerySchema = z.object({
  projectId: z.uuid(),
  languageId: z.string(),
});

export type FindOpenAutoTranslatePRQuery = z.infer<
  typeof FindOpenAutoTranslatePRQuerySchema
>;

export type OpenAutoTranslatePR = {
  id: number;
  branchId: number;
};

/**
 * @zh 查找指定语言当前开放中的 AUTO_TRANSLATE PR。
 * @en Find the currently open AUTO_TRANSLATE PR for the given language.
 */
export const findOpenAutoTranslatePR: Query<
  FindOpenAutoTranslatePRQuery,
  OpenAutoTranslatePR | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: pullRequest.id, branchId: pullRequest.branchId })
    .from(pullRequest)
    .where(
      and(
        eq(pullRequest.projectId, query.projectId),
        eq(pullRequest.type, "AUTO_TRANSLATE"),
        eq(pullRequest.targetLanguageId, query.languageId),
        notInArray(pullRequest.status, ["MERGED", "CLOSED"]),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
};
