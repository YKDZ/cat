import { eq, project } from "@cat/db";
import { assertFirstOrNull } from "@cat/shared/utils";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const GetProjectQuerySchema = z.object({
  projectId: z.uuidv4(),
});

export type GetProjectQuery = z.infer<typeof GetProjectQuerySchema>;

export const getProject: Query<
  GetProjectQuery,
  typeof project.$inferSelect | null
> = async (ctx, query) => {
  return assertFirstOrNull(
    await ctx.db.select().from(project).where(eq(project.id, query.projectId)),
  );
};
