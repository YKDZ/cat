import type { AuthContext } from "@cat/permissions";
import type { ObjectType, Relation } from "@cat/shared";

import { getPermissionEngine } from "@cat/permissions";
import { getContext, type Telefunc } from "telefunc";

/** Telefunc 上下文，auth 已确认非空 */
type AuthedContext = Omit<Telefunc.Context, "auth"> & { auth: AuthContext };

/**
 * 在 telefunc 函数内调用，确保当前请求已通过身份认证。
 * 返回携带非空 auth 的上下文。
 */
export const requireTelefuncAuth = (): AuthedContext => {
  const ctx = getContext();
  if (!ctx.auth) throw new Error("UNAUTHORIZED");
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return ctx as AuthedContext;
};

/**
 * 在 telefunc 函数内调用，确保已认证并对指定资源持有所需关系权限。
 * 无权限时抛出 FORBIDDEN 错误。
 */
export const requireTelefuncPermission = async (
  objectType: ObjectType,
  relation: Relation,
  objectId: string,
): Promise<AuthedContext> => {
  const ctx = requireTelefuncAuth();
  const engine = getPermissionEngine();
  const allowed = await engine.check(
    ctx.auth,
    { type: objectType, id: objectId },
    relation,
  );
  if (!allowed) throw new Error("FORBIDDEN");
  return ctx;
};
