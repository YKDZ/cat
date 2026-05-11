import {
  and,
  asc,
  contentRelation,
  desc,
  eq,
  gt,
  lt,
  or,
  translatableElement,
  vectorizedString,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListNeighborElementsQuerySchema = z.object({
  elementId: z.int(),
  before: z.int().min(0).default(2),
  after: z.int().min(0).default(2),
});
export type ListNeighborElementsQuery = z.infer<
  typeof ListNeighborElementsQuerySchema
>;

export type NeighborElementRow = {
  id: number;
  value: string;
  languageId: string;
  localOrder: number | null;
  primaryContentNodeId: string | null;
};

export const listNeighborElements: Query<
  ListNeighborElementsQuery,
  { before: NeighborElementRow[]; after: NeighborElementRow[] }
> = async (ctx, query) => {
  const refRows = await ctx.db
    .select({
      primaryContentNodeId: contentRelation.sourceNodeId,
      localOrder: contentRelation.localOrder,
    })
    .from(contentRelation)
    .where(
      and(
        eq(contentRelation.targetElementId, query.elementId),
        eq(contentRelation.targetEndpointKind, "ELEMENT"),
        eq(contentRelation.isPrimary, true),
      ),
    )
    .limit(1);

  const ref = refRows[0];
  if (!ref || ref.localOrder === null || ref.primaryContentNodeId === null)
    return { before: [], after: [] };

  const selectRows = () =>
    ctx.db
      .select({
        id: translatableElement.id,
        value: vectorizedString.value,
        languageId: vectorizedString.languageId,
        localOrder: contentRelation.localOrder,
        primaryContentNodeId: contentRelation.sourceNodeId,
      })
      .from(contentRelation)
      .innerJoin(
        translatableElement,
        eq(contentRelation.targetElementId, translatableElement.id),
      )
      .innerJoin(
        vectorizedString,
        eq(translatableElement.vectorizedStringId, vectorizedString.id),
      );

  const beforeRowsDesc = await selectRows()
    .where(
      and(
        eq(contentRelation.sourceNodeId, ref.primaryContentNodeId),
        eq(contentRelation.isPrimary, true),
        or(
          lt(contentRelation.localOrder, ref.localOrder),
          and(
            eq(contentRelation.localOrder, ref.localOrder),
            lt(translatableElement.id, query.elementId),
          ),
        ),
      ),
    )
    .orderBy(desc(contentRelation.localOrder), desc(translatableElement.id))
    .limit(query.before);
  const beforeRows = beforeRowsDesc.reverse();

  const afterRows = await selectRows()
    .where(
      and(
        eq(contentRelation.sourceNodeId, ref.primaryContentNodeId),
        eq(contentRelation.isPrimary, true),
        or(
          gt(contentRelation.localOrder, ref.localOrder),
          and(
            eq(contentRelation.localOrder, ref.localOrder),
            gt(translatableElement.id, query.elementId),
          ),
        ),
      ),
    )
    .orderBy(asc(contentRelation.localOrder), asc(translatableElement.id))
    .limit(query.after);

  return { before: beforeRows, after: afterRows };
};
