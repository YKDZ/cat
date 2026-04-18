import { eq, getColumns, memory, memoryToProject } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const ListProjectMemoriesQuerySchema = z.object({
  projectId: z.uuidv4(),
});

export type ListProjectMemoriesQuery = z.infer<
  typeof ListProjectMemoriesQuerySchema
>;

export const listProjectMemories: Query<
  ListProjectMemoriesQuery,
  Array<typeof memory.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select(getColumns(memory))
    .from(memoryToProject)
    .innerJoin(memory, eq(memoryToProject.memoryId, memory.id))
    .where(eq(memoryToProject.projectId, query.projectId));
};
