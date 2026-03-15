import { eq, memoryToProject } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListMemoryIdsByProjectQuerySchema = z.object({
  projectId: z.uuidv4(),
});

export type ListMemoryIdsByProjectQuery = z.infer<
  typeof ListMemoryIdsByProjectQuerySchema
>;

export const listMemoryIdsByProject: Query<
  ListMemoryIdsByProjectQuery,
  string[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ id: memoryToProject.memoryId })
    .from(memoryToProject)
    .where(eq(memoryToProject.projectId, query.projectId));

  return rows.map((row) => row.id);
};
