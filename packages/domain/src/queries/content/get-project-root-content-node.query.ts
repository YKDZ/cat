import { and, contentNode, eq } from "@cat/db";
import * as z from "zod";

import type { Query } from "@/types";

export const GetProjectRootContentNodeQuerySchema = z.object({
  projectId: z.uuidv4(),
});
export type GetProjectRootContentNodeQuery = z.infer<
  typeof GetProjectRootContentNodeQuerySchema
>;

/**
 * @zh 获取项目的根内容节点（kind = PROJECT_ROOT）。
 * @en Get the root content node of a project (kind = PROJECT_ROOT).
 */
export const getProjectRootContentNode: Query<
  GetProjectRootContentNodeQuery,
  typeof contentNode.$inferSelect | null
> = async (ctx, query) => {
  const rows = await ctx.db
    .select()
    .from(contentNode)
    .where(
      and(
        eq(contentNode.projectId, query.projectId),
        eq(contentNode.kind, "PROJECT_ROOT"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
};
