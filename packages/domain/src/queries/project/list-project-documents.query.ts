import { and, asc, document, documentClosure, eq, getColumns } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListProjectDocumentsQuerySchema = z.object({
  projectId: z.uuidv4(),
  page: z.int().min(0).optional(),
  pageSize: z.int().min(1).max(200).optional(),
});

export type ListProjectDocumentsQuery = z.infer<
  typeof ListProjectDocumentsQuerySchema
>;

export type ProjectDocumentRow = typeof document.$inferSelect & {
  parentId: string | null;
};

export const listProjectDocuments: Query<
  ListProjectDocumentsQuery,
  ProjectDocumentRow[]
> = async (ctx, query) => {
  const baseQuery = ctx.db
    .select({
      ...getColumns(document),
      parentId: documentClosure.ancestor,
    })
    .from(document)
    .leftJoin(
      documentClosure,
      and(
        eq(documentClosure.descendant, document.id),
        eq(documentClosure.depth, 1),
        eq(documentClosure.projectId, query.projectId),
      ),
    )
    .where(eq(document.projectId, query.projectId))
    .orderBy(asc(document.createdAt), asc(document.id));

  if (query.page === undefined || query.pageSize === undefined) {
    return baseQuery;
  }

  return baseQuery.limit(query.pageSize).offset(query.page * query.pageSize);
};
