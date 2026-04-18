import { and, crossReference, eq, getColumns } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListReferencesFromQuerySchema = z.object({
  sourceType: z.enum(["issue", "pr", "issue_comment"]),
  sourceId: z.int().positive(),
});

export type ListReferencesFromQuery = z.infer<
  typeof ListReferencesFromQuerySchema
>;

/** Forward lookup: given a source, list all targets it references. */
export const listReferencesFrom: Query<
  ListReferencesFromQuery,
  (typeof crossReference.$inferSelect)[]
> = async (ctx, query) => {
  return ctx.db
    .select({ ...getColumns(crossReference) })
    .from(crossReference)
    .where(
      and(
        eq(crossReference.sourceType, query.sourceType),
        eq(crossReference.sourceId, query.sourceId),
      ),
    );
};
