import { eq, glossaryToProject } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListGlossaryProjectIdsQuerySchema = z.object({
  glossaryId: z.uuidv4(),
});

export type ListGlossaryProjectIdsQuery = z.infer<
  typeof ListGlossaryProjectIdsQuerySchema
>;

export const listGlossaryProjectIds: Query<
  ListGlossaryProjectIdsQuery,
  string[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ projectId: glossaryToProject.projectId })
    .from(glossaryToProject)
    .where(eq(glossaryToProject.glossaryId, query.glossaryId));

  return rows.map((row) => row.projectId);
};