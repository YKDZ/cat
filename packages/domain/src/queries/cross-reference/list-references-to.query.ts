import { and, crossReference, eq, getColumns } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListReferencesToQuerySchema = z.object({
  targetType: z.enum(["issue", "pr"]),
  targetId: z.int().positive(),
});

export type ListReferencesToQuery = z.infer<typeof ListReferencesToQuerySchema>;

/** Reverse lookup: given a target (Issue or PR), list all sources that reference it. */
export const listReferencesTo: Query<
  ListReferencesToQuery,
  (typeof crossReference.$inferSelect)[]
> = async (ctx, query) => {
  return ctx.db
    .select({ ...getColumns(crossReference) })
    .from(crossReference)
    .where(
      and(
        eq(crossReference.targetType, query.targetType),
        eq(crossReference.targetId, query.targetId),
      ),
    );
};
