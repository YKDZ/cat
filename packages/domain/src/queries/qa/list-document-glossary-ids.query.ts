import { document, eq, glossaryToProject, project } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListDocumentGlossaryIdsQuerySchema = z.object({
  documentId: z.uuidv4(),
});

export type ListDocumentGlossaryIdsQuery = z.infer<
  typeof ListDocumentGlossaryIdsQuerySchema
>;

export const listDocumentGlossaryIds: Query<
  ListDocumentGlossaryIdsQuery,
  string[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({
      id: glossaryToProject.glossaryId,
    })
    .from(glossaryToProject)
    .innerJoin(document, eq(document.id, query.documentId))
    .innerJoin(project, eq(document.projectId, project.id))
    .where(eq(glossaryToProject.projectId, project.id));

  return rows.map((row) => row.id);
};
