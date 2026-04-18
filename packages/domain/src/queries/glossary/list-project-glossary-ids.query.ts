import { eq, glossaryToProject } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListProjectGlossaryIdsQuerySchema = z.object({
  projectId: z.uuidv4(),
});

export type ListProjectGlossaryIdsQuery = z.infer<
  typeof ListProjectGlossaryIdsQuerySchema
>;

export const listProjectGlossaryIds: Query<
  ListProjectGlossaryIdsQuery,
  string[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: glossaryToProject.glossaryId })
    .from(glossaryToProject)
    .where(eq(glossaryToProject.projectId, query.projectId));

  return rows.map((row) => row.id);
};
