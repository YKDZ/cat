import { and, changeset, changesetEntry, eq, sql } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

/**
 * Input for checking whether a branch translation overlay exists.
 */
export const HasBranchTranslationOverlayQuerySchema = z.object({
  branchId: z.int().positive(),
  elementId: z.int().positive(),
  languageId: z.string(),
});

/**
 * Input type for checking whether a branch translation overlay exists.
 */
export type HasBranchTranslationOverlayQuery = z.infer<
  typeof HasBranchTranslationOverlayQuerySchema
>;

/**
 * Determine whether a translation overlay exists for the given element and language in a branch.
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
