import type { ObjectType, Relation } from "@cat/shared/schema/permission";

import {
  getDocument,
  getElementWithChunkIds,
  listTranslationsByIds,
} from "@cat/domain";
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

// ============================================================
// 类型安全的权限中间件
// 使用 oRPC 的 .use(middleware, mapInput) 模式
// mapInput 函数的参数类型会从 .input() schema 自动推断
// ============================================================

/**
 * 检查对特定资源的权限。
 * 输入：objectId (string)
 *
 * 用法：
 * authed
 *   .input(z.object({ projectId: z.uuidv4() }))
 *   .use(checkPermission("project", "owner"), (i) => i.projectId)
 *   .handler(...)
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types
export const checkPermission = (objectType: ObjectType, relation: Relation) => {
  type AuthedContext = {
    user: NonNullable<Context["user"]>;
    sessionId: NonNullable<Context["sessionId"]>;
    auth: NonNullable<Context["auth"]>;
  };

  return os
    .$context<AuthedContext>()
    .middleware(async ({ context, next }, objectId: string) => {
      const engine = getPermissionEngine();
      const allowed = await engine.check(
        context.auth,
        { type: objectType, id: objectId },
        relation,
      );
      if (!allowed) throw new ORPCError("FORBIDDEN");
      return next({
        context: {
          user: context.user,
          sessionId: context.sessionId,
          auth: context.auth,
        },
      });
    });
};

/**
 * 检查 Document 权限（通过 projectId 传递）。
 * 输入：documentId (string)
 *
 * 用法：
 * authed
 *   .input(z.object({ documentId: z.uuidv4() }))
 *   .use(checkDocumentPermission("viewer"), (i) => i.documentId)
 *   .handler(...)
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types
export const checkDocumentPermission = (relation: Relation) => {
  type AuthedContext = {
    user: NonNullable<Context["user"]>;
    sessionId: NonNullable<Context["sessionId"]>;
    auth: NonNullable<Context["auth"]>;
    drizzleDB: Context["drizzleDB"];
  };

  return os
    .$context<AuthedContext>()
    .middleware(async ({ context, next }, documentId: string) => {
      const {
        drizzleDB: { client: drizzle },
      } = context;

      const doc = await getDocument({ db: drizzle }, { documentId });
      if (!doc)
        throw new ORPCError("NOT_FOUND", { message: "Document not found" });

      const engine = getPermissionEngine();
      const allowed = await engine.check(
        context.auth,
        { type: "project", id: doc.projectId },
        relation,
      );
      if (!allowed) throw new ORPCError("FORBIDDEN");
      return next({
        context: {
          user: context.user,
          sessionId: context.sessionId,
          auth: context.auth,
        },
      });
    });
};

/**
 * 检查 Element 权限（通过 document → projectId 传递）。
 * 输入：elementId (number)
 *
 * 用法：
 * authed
 *   .input(z.object({ elementId: z.int() }))
 *   .use(checkElementPermission("viewer"), (i) => i.elementId)
 *   .handler(...)
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types
export const checkElementPermission = (relation: Relation) => {
  type AuthedContext = {
    user: NonNullable<Context["user"]>;
    sessionId: NonNullable<Context["sessionId"]>;
    auth: NonNullable<Context["auth"]>;
    drizzleDB: Context["drizzleDB"];
  };

  return os
    .$context<AuthedContext>()
    .middleware(async ({ context, next }, elementId: number) => {
      const {
        drizzleDB: { client: drizzle },
      } = context;

      const element = await getElementWithChunkIds(
        { db: drizzle },
        { elementId },
      );
      if (!element)
        throw new ORPCError("NOT_FOUND", { message: "Element not found" });

      const engine = getPermissionEngine();
      const allowed = await engine.check(
        context.auth,
        { type: "project", id: element.projectId },
        relation,
      );
      if (!allowed) throw new ORPCError("FORBIDDEN");
      return next({
        context: {
          user: context.user,
          sessionId: context.sessionId,
          auth: context.auth,
        },
      });
    });
};

// ============================================================
// 向后兼容的旧 API（使用 unknown 类型，不推荐）
// 保留这些是为了平滑迁移，新代码应使用上面的 check* 函数
// ============================================================

/**
 * @deprecated 使用 checkPermission 配合 .use() 替代
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

/**
 * @deprecated 使用 checkDocumentPermission 配合 .use() 替代
 * Document 权限检查中间件工厂。
 */
// oxlint-disable-next-line explicit-module-boundary-types
export const requireDocumentPermission = (
  relation: Relation,
  getDocumentId: (input: unknown) => string,
) =>
  authed.use(async ({ context, next }, input) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const documentId = getDocumentId(input);

    const doc = await getDocument({ db: drizzle }, { documentId });
    if (!doc)
      throw new ORPCError("NOT_FOUND", { message: "Document not found" });

    const engine = getPermissionEngine();
    const allowed = await engine.check(
      context.auth,
      { type: "project", id: doc.projectId },
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

/**
 * @deprecated 使用 checkElementPermission 配合 .use() 替代
 * Element 权限检查中间件工厂。
 */
// oxlint-disable-next-line explicit-module-boundary-types
export const requireElementPermission = (
  relation: Relation,
  getElementId: (input: unknown) => number,
) =>
  authed.use(async ({ context, next }, input) => {
    const {
      drizzleDB: { client: drizzle },
    } = context;
    const elementId = getElementId(input);

    const element = await getElementWithChunkIds(
      { db: drizzle },
      { elementId },
    );
    if (!element)
      throw new ORPCError("NOT_FOUND", { message: "Element not found" });

    const engine = getPermissionEngine();
    const allowed = await engine.check(
      context.auth,
      { type: "project", id: element.projectId },
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

/**
 * 检查 Translation 权限（通过 translationId → elementId → projectId 传递）。
 * 输入：translationId (number)
 *
 * 用法：
 * authed
 *   .input(z.object({ translationId: z.int() }))
 *   .use(checkTranslationPermission("editor"), (i) => i.translationId)
 *   .handler(...)
 */
// oxlint-disable-next-line typescript/explicit-module-boundary-types
export const checkTranslationPermission = (relation: Relation) => {
  type AuthedContext = {
    user: NonNullable<Context["user"]>;
    sessionId: NonNullable<Context["sessionId"]>;
    auth: NonNullable<Context["auth"]>;
    drizzleDB: Context["drizzleDB"];
  };

  return os
    .$context<AuthedContext>()
    .middleware(async ({ context, next }, translationId: number) => {
      const {
        drizzleDB: { client: drizzle },
      } = context;

      const translations = await listTranslationsByIds(
        { db: drizzle },
        { translationIds: [translationId] },
      );
      const translation = translations[0];
      if (!translation)
        throw new ORPCError("NOT_FOUND", { message: "Translation not found" });

      const element = await getElementWithChunkIds(
        { db: drizzle },
        { elementId: translation.translatableElementId },
      );
      if (!element)
        throw new ORPCError("NOT_FOUND", { message: "Element not found" });

      const engine = getPermissionEngine();
      const allowed = await engine.check(
        context.auth,
        { type: "project", id: element.projectId },
        relation,
      );
      if (!allowed) throw new ORPCError("FORBIDDEN");
      return next({
        context: {
          user: context.user,
          sessionId: context.sessionId,
          auth: context.auth,
        },
      });
    });
};
