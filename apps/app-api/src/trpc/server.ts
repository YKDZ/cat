import { initTRPC, TRPCError } from "@trpc/server";
import { logger } from "@cat/shared/utils";
import type { HttpContext } from "./context.ts";
import { transformer } from "./transformer.ts";
import type { ResourceType } from "@cat/shared/schema/drizzle/enum";
import { z, type ZodObject } from "zod";
import type { inferParser } from "@trpc/server/unstable-core-do-not-import";
import {
  checkPermission,
  checkPermissions,
} from "@cat/app-server-shared/utils";
import { permissionTemplate } from "@cat/db";

const t = initTRPC.context<HttpContext>().create({
  transformer,
  errorFormatter: ({ shape }) => {
    logger.debug("RPC", { stack: JSON.stringify(shape.data.stack) });
    return {
      ...shape,
    };
  },
});

export const { createCallerFactory, router } = t;
export const publicProcedure = t.procedure;

export const authedProcedure = t.procedure.use(async ({ ctx, next }) => {
  const { user, sessionId } = ctx;
  if (!user || !sessionId)
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You need to login to access this procedure",
    });
  return await next({
    ctx: {
      user,
      sessionId,
    },
  });
});

// oxlint-disable-next-line explicit-module-boundary-types
export const permissionProcedure = <T extends ZodObject>(
  resourceType: ResourceType,
  requiredPermission: string,
  inputSchema?: T,
  getId?: (input: inferParser<T>["out"]) => string | undefined,
) =>
  authedProcedure
    // oxlint-disable-next-line no-unsafe-type-assertion
    .input((inputSchema ?? z.any()) as T)
    .use(async ({ ctx, input, next }) => {
      const {
        drizzleDB: { client: drizzle },
        user,
      } = ctx;
      const resourceId = getId ? getId(input) : String(Object.values(input)[0]);

      // 被动维护权限模板
      // TODO 删除不存在的权限
      await drizzle
        .insert(permissionTemplate)
        .values({
          resourceType,
          content: requiredPermission,
        })
        .onConflictDoNothing();

      const hasPermission = await checkPermission(
        drizzle,
        user.id,
        resourceType,
        requiredPermission,
        resourceId,
      );

      if (!hasPermission)
        throw new TRPCError({
          code: "FORBIDDEN",
          message: `You do not have permission ${requiredPermission} on ${resourceType} ${resourceId}`,
        });

      return next();
    });

// oxlint-disable-next-line explicit-module-boundary-types
export const permissionsProcedure = <T extends ZodObject>(
  permissions: {
    resourceType: ResourceType;
    requiredPermission: string;
    inputSchema?: T;
    getId?: (input: inferParser<T>["out"]) => string | undefined;
  }[],
) => {
  const inputSchema = z.object({});
  permissions.forEach(({ inputSchema: schema }) => {
    if (!schema || typeof schema !== "object") return;
    inputSchema.extend(schema.shape);
  });

  return (
    authedProcedure
      // oxlint-disable-next-line no-unsafe-type-assertion
      .input((inputSchema ?? z.any()) as T)
      .use(async ({ ctx, input, next }) => {
        const {
          drizzleDB: { client: drizzle },
          user,
        } = ctx;

        const requiredPermisisons = permissions.map(
          ({ getId, requiredPermission, resourceType }) => {
            const resourceId = getId
              ? getId(input)
              : String(Object.values(input)[0]);
            return {
              resourceId,
              requiredPermission,
              resourceType,
            };
          },
        );

        // 被动维护权限模板
        // TODO 删除不存在的权限
        await drizzle
          .insert(permissionTemplate)
          .values(
            permissions.map(({ resourceType, requiredPermission }) => ({
              resourceType,
              content: requiredPermission,
            })),
          )
          .onConflictDoNothing();

        const hasPermission = await checkPermissions(
          drizzle,
          user.id,
          requiredPermisisons,
        );

        if (!hasPermission)
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `You do not have permission: ${requiredPermisisons.map((p) => `${p.requiredPermission} on ${p.resourceType} ${p.resourceId ?? ""}`).join(", ")}`,
          });

        return next();
      })
  );
};
