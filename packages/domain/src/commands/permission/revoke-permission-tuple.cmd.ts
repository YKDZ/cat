import { and, eq, permissionTuple } from "@cat/db";
import {
  ObjectTypeSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const RevokePermissionTupleCommandSchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string(),
  relation: RelationSchema,
  objectType: ObjectTypeSchema,
  objectId: z.string(),
});

export type RevokePermissionTupleCommand = z.infer<
  typeof RevokePermissionTupleCommandSchema
>;

/** 删除权限关系元组。元组不存在时静默完成（幂等）。 */
export const revokePermissionTuple: Command<
  RevokePermissionTupleCommand
> = async (ctx, command) => {
  await ctx.db
    .delete(permissionTuple)
    .where(
      and(
        eq(permissionTuple.subjectType, command.subjectType),
        eq(permissionTuple.subjectId, command.subjectId),
        eq(permissionTuple.relation, command.relation),
        eq(permissionTuple.objectType, command.objectType),
        eq(permissionTuple.objectId, command.objectId),
      ),
    );

  return { result: undefined, events: [] };
};
