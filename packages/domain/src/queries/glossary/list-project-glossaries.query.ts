import { eq, getColumns, glossary, glossaryToProject } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListProjectGlossariesQuerySchema = z.object({
  projectId: z.uuidv4(),
});

export type ListProjectGlossariesQuery = z.infer<
  typeof ListProjectGlossariesQuerySchema
>;

export const listProjectGlossaries: Query<
  ListProjectGlossariesQuery,
  Array<typeof glossary.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select(getColumns(glossary))
    .from(glossaryToProject)
    .innerJoin(glossary, eq(glossaryToProject.glossaryId, glossary.id))
    .where(eq(glossaryToProject.projectId, query.projectId));
};
