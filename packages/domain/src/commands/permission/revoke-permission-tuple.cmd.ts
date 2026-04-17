import { and, eq, inArray, permissionTuple } from "@cat/db";
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

/** 当 revoke editor/admin/owner on project 时需检查是否仍有 editor+ 来源 */
const EDITOR_OR_ABOVE: z.infer<typeof RelationSchema>[] = [
  "editor",
  "admin",
  "owner",
];

/** 删除权限关系元组。元组不存在时静默完成（幂等）。
 * 联动规则：当 objectType=project 且 relation ∈ {editor,admin,owner} 时，
 * 移除当前元组后，若 Subject 对该 project 已无任何 editor+ 来源，
 * 则联动 revoke `direct_editor` 和 `isolation_forced`。
 */
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

  // 联动清理：当撤销 project 的 editor/admin/owner 时
  if (
    command.objectType === "project" &&
    EDITOR_OR_ABOVE.includes(command.relation)
  ) {
    // 检查 Subject 对该 project 是否还有其他 editor+ 来源
    const remainingEditorTuples = await ctx.db
      .select({ relation: permissionTuple.relation })
      .from(permissionTuple)
      .where(
        and(
          eq(permissionTuple.subjectType, command.subjectType),
          eq(permissionTuple.subjectId, command.subjectId),
          eq(permissionTuple.objectType, command.objectType),
          eq(permissionTuple.objectId, command.objectId),
          inArray(permissionTuple.relation, EDITOR_OR_ABOVE),
        ),
      );

    if (remainingEditorTuples.length === 0) {
      // 无任何 editor+ 来源，联动清理 direct_editor 和 isolation_forced
      await ctx.db
        .delete(permissionTuple)
        .where(
          and(
            eq(permissionTuple.subjectType, command.subjectType),
            eq(permissionTuple.subjectId, command.subjectId),
            eq(permissionTuple.objectType, command.objectType),
            eq(permissionTuple.objectId, command.objectId),
            inArray(permissionTuple.relation, [
              "direct_editor",
              "isolation_forced",
            ]),
          ),
        );
    }
  }

  return { result: undefined, events: [] };
};
