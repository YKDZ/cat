import { eq, project } from "@cat/db";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListOwnedProjectsQuerySchema = z.object({
  creatorId: z.uuidv4(),
});

export type ListOwnedProjectsQuery = z.infer<
  typeof ListOwnedProjectsQuerySchema
>;

export const listOwnedProjects: Query<
  ListOwnedProjectsQuery,
  Array<typeof project.$inferSelect>
> = async (ctx, query) => {
  return ctx.db
    .select()
    .from(project)
    .where(eq(project.creatorId, query.creatorId));
};
