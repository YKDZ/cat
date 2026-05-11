import {
  and,
  asc,
  contentNode,
  contentRelation,
  contentRelationType,
  eq,
  getColumns,
} from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListProjectContentNodesQuerySchema = z.object({
  projectId: z.uuidv4(),
});
export type ListProjectContentNodesQuery = z.infer<
  typeof ListProjectContentNodesQuerySchema
>;

export type ProjectContentNodeRow = typeof contentNode.$inferSelect & {
  parentId: string | null;
  localOrder: number | null;
};

export const listProjectContentNodes: Query<
  ListProjectContentNodesQuery,
  ProjectContentNodeRow[]
> = async (ctx, query) => {
  const parentRelation = contentRelation;
  return ctx.db
    .select({
      ...getColumns(contentNode),
      parentId: parentRelation.sourceNodeId,
      localOrder: parentRelation.localOrder,
    })
    .from(contentNode)
    .leftJoin(
      parentRelation,
      and(
        eq(parentRelation.targetNodeId, contentNode.id),
        eq(parentRelation.targetEndpointKind, "NODE"),
        eq(parentRelation.isPrimary, true),
      ),
    )
    .leftJoin(
      contentRelationType,
      eq(parentRelation.relationTypeId, contentRelationType.id),
    )
    .where(eq(contentNode.projectId, query.projectId))
    .orderBy(asc(parentRelation.localOrder), asc(contentNode.displayLabel));
};
