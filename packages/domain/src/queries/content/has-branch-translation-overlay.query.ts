import { and, changeset, changesetEntry, eq, sql } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

/**
 * @zh 查询分支翻译 overlay 是否存在的输入。
 * @en Input for checking whether a branch translation overlay exists.
 */
export const HasBranchTranslationOverlayQuerySchema = z.object({
  branchId: z.int().positive(),
  elementId: z.int().positive(),
  languageId: z.string(),
});

/**
 * @zh 查询分支翻译 overlay 是否存在的输入类型。
 * @en Input type for checking whether a branch translation overlay exists.
 */
export type HasBranchTranslationOverlayQuery = z.infer<
  typeof HasBranchTranslationOverlayQuerySchema
>;

/**
 * @zh 判断指定分支中是否存在某元素/语言的翻译 overlay。
 * @en Determine whether a translation overlay exists for the given element and language in a branch.
 */
export const hasBranchTranslationOverlayQuery: Query<
  HasBranchTranslationOverlayQuery,
  boolean
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      entryId: changesetEntry.id,
    })
    .from(changesetEntry)
    .innerJoin(changeset, eq(changesetEntry.changesetId, changeset.id))
    .where(
      and(
        eq(changeset.branchId, query.branchId),
        eq(changesetEntry.entityType, "translation"),
        sql`${changesetEntry.after}->>'translatableElementId' = ${String(query.elementId)}`,
        sql`${changesetEntry.after}->>'languageId' = ${query.languageId}`,
      ),
    )
    .limit(1);

  return rows.length > 0;
};
