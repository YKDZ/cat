import { and, eq, permissionTuple } from "@cat/db";
import {
  ObjectTypeSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import * as z from "zod";

import type { Query } from "@/types";

export const ListPermissionSubjectsQuerySchema = z.object({
  objectType: ObjectTypeSchema,
  objectId: z.string(),
  filterRelation: RelationSchema.optional(),
});

export type ListPermissionSubjectsQuery = z.infer<
  typeof ListPermissionSubjectsQuerySchema
>;

export type PermissionSubjectRow = {
  subjectType: z.infer<typeof SubjectTypeSchema>;
  subjectId: string;
  relation: z.infer<typeof RelationSchema>;
};

export const listPermissionSubjects: Query<
  ListPermissionSubjectsQuery,
  PermissionSubjectRow[]
> = async (ctx, query) => {
  const conditions = [
    eq(permissionTuple.objectType, query.objectType),
    eq(permissionTuple.objectId, query.objectId),
  ];
  if (query.filterRelation) {
    conditions.push(eq(permissionTuple.relation, query.filterRelation));
  }

  const rows = await ctx.db
    .select({
      subjectType: permissionTuple.subjectType,
      subjectId: permissionTuple.subjectId,
      relation: permissionTuple.relation,
    })
    .from(permissionTuple)
    .where(and(...conditions));

  return rows.map((row) => ({
    subjectType: SubjectTypeSchema.parse(row.subjectType),
    subjectId: row.subjectId,
    relation: RelationSchema.parse(row.relation),
  }));
};
