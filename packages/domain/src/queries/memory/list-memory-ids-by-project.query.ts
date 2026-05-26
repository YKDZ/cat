import { and, eq, memory, memoryToProject } from "@cat/db";
import * as z from "zod";

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
    .innerJoin(memory, eq(memoryToProject.memoryId, memory.id))
    .where(
      and(
        eq(memoryToProject.projectId, query.projectId),
        eq(memory.scope, "PROJECT"),
      ),
    );

  return rows.map((row) => row.id);
};
