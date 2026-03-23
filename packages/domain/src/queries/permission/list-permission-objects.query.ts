import { and, eq, inArray, permissionTuple } from "@cat/db";
import {
  ObjectTypeSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import * as z from "zod/v4";

import type { Query } from "@/types";

export const ListPermissionObjectsQuerySchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string(),
  objectType: ObjectTypeSchema,
  /** 若提供，只筛选指定关系（及对该资源类型而言更高的层级）。调用者负责展开层级后传入。 */
  filterRelations: z.array(RelationSchema).optional(),
});

export type ListPermissionObjectsQuery = z.infer<
  typeof ListPermissionObjectsQuerySchema
>;

export type PermissionObjectRow = {
  objectId: string;
  relation: z.infer<typeof RelationSchema>;
};

export const listPermissionObjects: Query<
  ListPermissionObjectsQuery,
  PermissionObjectRow[]
> = async (ctx, query) => {
  const conditions = [
    eq(permissionTuple.subjectType, query.subjectType),
    eq(permissionTuple.subjectId, query.subjectId),
    eq(permissionTuple.objectType, query.objectType),
  ];
  if (query.filterRelations && query.filterRelations.length > 0) {
    conditions.push(inArray(permissionTuple.relation, query.filterRelations));
  }

  const rows = await ctx.db
    .select({
      objectId: permissionTuple.objectId,
      relation: permissionTuple.relation,
    })
    .from(permissionTuple)
    .where(and(...conditions));

  return rows.map((row) => ({
    objectId: row.objectId,
    relation: RelationSchema.parse(row.relation),
  }));
};
