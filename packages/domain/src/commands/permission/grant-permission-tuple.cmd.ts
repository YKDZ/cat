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

/** 当 grant editor/admin/owner on project 时自动联写 direct_editor */
const EDITOR_OR_ABOVE: z.infer<typeof RelationSchema>[] = [
  "editor",
  "admin",
  "owner",
];

/** 插入权限关系元组，已存在则忽略（幂等）。
 * 联写规则：当 objectType=project 且 relation ∈ {editor,admin,owner} 时，
 * 同一事务内额外 grant `direct_editor`（幂等）。
 */
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

  // 联写 direct_editor：当授予 project 的 editor/admin/owner 时
  if (
    command.objectType === "project" &&
    EDITOR_OR_ABOVE.includes(command.relation)
  ) {
    await ctx.db
      .insert(permissionTuple)
      .values({
        subjectType: command.subjectType,
        subjectId: command.subjectId,
        relation: "direct_editor",
        objectType: command.objectType,
        objectId: command.objectId,
      })
      .onConflictDoNothing();
  }

  return { result: undefined, events: [] };
};
