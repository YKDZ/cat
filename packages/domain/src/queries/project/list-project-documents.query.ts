import { and, document, documentClosure, eq, getColumns } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListProjectDocumentsQuerySchema = z.object({
  projectId: z.uuidv4(),
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
  return ctx.db
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
    .where(eq(document.projectId, query.projectId));
};
