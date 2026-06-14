import { and, contentRelation, eq, translatableElement } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListContentNodeElementIdsQuerySchema = z.object({
  contentNodeId: z.uuidv4(),
});

export type ListContentNodeElementIdsQuery = z.infer<
  typeof ListContentNodeElementIdsQuerySchema
>;

/**
 * Get all translatable element IDs that belong to a content node (primary relations).
 */
export const listContentNodeElementIds: Query<
  ListContentNodeElementIdsQuery,
  number[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: translatableElement.id })
    .from(contentRelation)
    .innerJoin(
      translatableElement,
      eq(contentRelation.targetElementId, translatableElement.id),
    )
    .where(
      and(
        eq(contentRelation.sourceNodeId, query.contentNodeId),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.isPrimary, true),
      ),
    );

  return rows.map((r) => r.id);
};
