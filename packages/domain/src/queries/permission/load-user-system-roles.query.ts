import { and, eq, permissionTuple } from "@cat/db";
import { RelationSchema } from "@cat/shared/schema/permission";
import * as z from "zod";

import type { Query } from "@/types";

export const LoadUserSystemRolesQuerySchema = z.object({
  userId: z.string(),
});

export type LoadUserSystemRolesQuery = z.infer<
  typeof LoadUserSystemRolesQuerySchema
>;

export type UserSystemRole = z.infer<typeof RelationSchema>;

/**
 * 加载用户的系统级角色（system object 上的权限元组）。
 * 返回用户对 system:* 持有的所有 relation 列表。
 */
export const loadUserSystemRoles: Query<
  LoadUserSystemRolesQuery,
  UserSystemRole[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ relation: permissionTuple.relation })
    .from(permissionTuple)
    .where(
      and(
        eq(permissionTuple.subjectType, "user"),
        eq(permissionTuple.subjectId, query.userId),
        eq(permissionTuple.objectType, "system"),
        eq(permissionTuple.objectId, "*"),
      ),
    );

  return rows.map((row) => RelationSchema.parse(row.relation));
};
