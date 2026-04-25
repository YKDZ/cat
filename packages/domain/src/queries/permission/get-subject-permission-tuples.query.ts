import { and, eq, permissionTuple } from "@cat/db";
import {
  ObjectTypeSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared";
import * as z from "zod";

import type { Query } from "@/types";

export const GetSubjectPermissionTuplesQuerySchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string(),
  objectType: ObjectTypeSchema,
  objectId: z.string(),
});

export type GetSubjectPermissionTuplesQuery = z.infer<
  typeof GetSubjectPermissionTuplesQuerySchema
>;

export type SubjectPermissionTupleRow = {
  relation: z.infer<typeof RelationSchema>;
};

export const getSubjectPermissionTuples: Query<
  GetSubjectPermissionTuplesQuery,
  SubjectPermissionTupleRow[]
> = async (ctx, query) => {
  const rows = await ctx.db
    .select({ relation: permissionTuple.relation })
    .from(permissionTuple)
    .where(
      and(
        eq(permissionTuple.subjectType, query.subjectType),
        eq(permissionTuple.subjectId, query.subjectId),
        eq(permissionTuple.objectType, query.objectType),
        eq(permissionTuple.objectId, query.objectId),
      ),
    );

  return rows.map((row) => ({ relation: RelationSchema.parse(row.relation) }));
};
