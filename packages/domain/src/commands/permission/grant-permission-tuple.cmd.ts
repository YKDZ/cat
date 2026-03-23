import { permissionTuple } from "@cat/db";
import {
  ObjectTypeSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import * as z from "zod/v4";

import type { Command } from "@/types";

export const GrantPermissionTupleCommandSchema = z.object({
  subjectType: SubjectTypeSchema,
  subjectId: z.string(),
  relation: RelationSchema,
  objectType: ObjectTypeSchema,
  objectId: z.string(),
});

export type GrantPermissionTupleCommand = z.infer<
  typeof GrantPermissionTupleCommandSchema
>;

/** 插入权限关系元组，已存在则忽略（幂等）。 */
export const grantPermissionTuple: Command<
  GrantPermissionTupleCommand
> = async (ctx, command) => {
  await ctx.db
    .insert(permissionTuple)
    .values({
      subjectType: command.subjectType,
      subjectId: command.subjectId,
      relation: command.relation,
      objectType: command.objectType,
      objectId: command.objectId,
    })
    .onConflictDoNothing();

  return { result: undefined, events: [] };
};
