import { getPermissionEngine } from "@cat/permissions";
import {
  ObjectTypeSchema,
  PermissionCheckSchema,
  RelationSchema,
  SubjectTypeSchema,
} from "@cat/shared/schema/permission";
import * as z from "zod/v4";

import { authed, requirePermission } from "@/orpc/server";

/**
 * 检查当前用户对某资源的权限。
 * 供 SSR guard、前端查询使用。
 */
export const check = authed
  .input(PermissionCheckSchema)
  .output(z.boolean())
  .handler(async ({ context, input }) => {
    const engine = getPermissionEngine();
    return engine.check(
      context.auth,
      { type: input.objectType, id: input.objectId },
      input.relation,
    );
  });

/**
 * 列出当前用户对某资源持有的所有有效关系。
 */
export const listMyPermissionsOn = authed
  .input(
    z.object({
      objectType: ObjectTypeSchema,
      objectId: z.string(),
    }),
  )
  .output(z.array(RelationSchema))
  .handler(async ({ context, input }) => {
    const engine = getPermissionEngine();
    const subjects = await engine.listSubjects({
      type: input.objectType,
      id: input.objectId,
    });
    return subjects
      .filter(
        (s) =>
          s.type === context.auth.subjectType &&
          s.id === context.auth.subjectId,
      )
      .map((s) => s.relation);
  });

/**
 * 授予权限元组（仅 system#admin 可操作）。
 */
export const grant = requirePermission("system", "admin", () => "*")
  .input(
    z.object({
      subjectType: SubjectTypeSchema,
      subjectId: z.string(),
      relation: RelationSchema,
      objectType: ObjectTypeSchema,
      objectId: z.string(),
    }),
  )
  .output(z.void())
  .handler(async ({ input }) => {
    const engine = getPermissionEngine();
    await engine.grant(
      { type: input.subjectType, id: input.subjectId },
      input.relation,
      { type: input.objectType, id: input.objectId },
    );
  });

/**
 * 撤销权限元组（仅 system#admin 可操作）。
 */
export const revoke = requirePermission("system", "admin", () => "*")
  .input(
    z.object({
      subjectType: SubjectTypeSchema,
      subjectId: z.string(),
      relation: RelationSchema,
      objectType: ObjectTypeSchema,
      objectId: z.string(),
    }),
  )
  .output(z.void())
  .handler(async ({ input }) => {
    const engine = getPermissionEngine();
    await engine.revoke(
      { type: input.subjectType, id: input.subjectId },
      input.relation,
      { type: input.objectType, id: input.objectId },
    );
  });

/**
 * 列出某资源的所有授权主体（仅 system#admin 可操作）。
 */
export const listSubjects = requirePermission("system", "admin", () => "*")
  .input(
    z.object({
      objectType: ObjectTypeSchema,
      objectId: z.string(),
      relation: RelationSchema.optional(),
    }),
  )
  .output(
    z.array(
      z.object({
        type: SubjectTypeSchema,
        id: z.string(),
        relation: RelationSchema,
      }),
    ),
  )
  .handler(async ({ input }) => {
    const engine = getPermissionEngine();
    return engine.listSubjects(
      { type: input.objectType, id: input.objectId },
      input.relation,
    );
  });
