import type { ObjectType, Relation } from "@cat/shared/schema/permission";

import { getPermissionEngine } from "@cat/permissions";
import { ORPCError, os } from "@orpc/server";

import type { Context } from "@/utils/context";

export const base = os.$context<Context>();

export const authed = base.use(async ({ context, next }) => {
  const { user, sessionId, auth } = context;

  if (!user || !sessionId || !auth) throw new ORPCError("UNAUTHORIZED");

  return await next({
    context: {
      user,
      sessionId,
      auth,
    },
  });
});

/**
 * 资源级鉴权中间件工厂。
 * 在 authed 基础上，进一步校验当前用户对指定资源是否持有 relation 权限。
 */
// oxlint-disable-next-line explicit-module-boundary-types
export const requirePermission = (
  objectType: ObjectType,
  relation: Relation,
  getObjectId: (input: unknown) => string,
) =>
  authed.use(async ({ context, next }, input) => {
    const engine = getPermissionEngine();
    const allowed = await engine.check(
      context.auth,
      { type: objectType, id: getObjectId(input) },
      relation,
    );
    if (!allowed) throw new ORPCError("FORBIDDEN");
    return await next({
      context: {
        user: context.user,
        sessionId: context.sessionId,
        auth: context.auth,
      },
    });
  });
