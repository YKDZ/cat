import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { JSONSchemaSchema } from "@cat/shared/schema/json";
import type { AuthProvider } from "@cat/plugin-core";
import { publicProcedure, router } from "@/server/trpc/server.ts";
import { getServiceFromDBId } from "@/server/utils/plugin.ts";

export const authRouter = router({
  queryPreAuthFormSchema: publicProcedure
    .input(
      z.object({
        providerId: z.int(),
      }),
    )
    .output(JSONSchemaSchema)
    .query(async ({ ctx, input }) => {
      const {
        pluginRegistry,
        prismaDB: { client: prisma },
      } = ctx;
      const { providerId } = input;

      const provider = await getServiceFromDBId<AuthProvider>(
        prisma,
        pluginRegistry,
        providerId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      if (typeof provider.getPreAuthFormSchema !== "function") return {};

      return provider.getPreAuthFormSchema();
    }),
  preAuth: publicProcedure
    .input(
      z.object({
        providerId: z.int(),
        gotFromClient: z.object({
          formData: z.json().optional(),
        }),
      }),
    )
    .output(z.record(z.string(), z.unknown()).nullable())
    .mutation(async ({ ctx, input }) => {
      const {
        redisDB: { redis },
        prismaDB: { client: prisma },
        user,
        pluginRegistry,
        helpers,
        setCookie,
      } = ctx;
      const { providerId, gotFromClient } = input;

      if (user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

      const provider = await getServiceFromDBId<AuthProvider>(
        prisma,
        pluginRegistry,
        providerId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      const sessionId = randomBytes(32).toString("hex");

      if (typeof provider.handlePreAuth === "function") {
        const { passToClient, sessionMeta } = await provider.handlePreAuth(
          sessionId,
          gotFromClient,
          helpers,
        );

        const sessionKey = `auth:preAuth:session:${sessionId}`;
        await redis.hSet(sessionKey, {
          _providerId: providerId,
          ...sessionMeta,
        });

        setCookie("preAuthSessionId", sessionId);

        return passToClient;
      } else {
        const sessionKey = `auth:preAuth:session:${sessionId}`;
        await redis.hSet(sessionKey, {
          _providerId: providerId,
        });

        setCookie("preAuthSessionId", sessionId);

        return null;
      }
    }),
  queryAuthFormSchema: publicProcedure
    .input(
      z.object({
        providerId: z.int(),
      }),
    )
    .output(JSONSchemaSchema)
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { providerId } = input;

      const provider = await getServiceFromDBId<AuthProvider>(
        prisma,
        pluginRegistry,
        providerId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      if (typeof provider.getAuthFormSchema !== "function") return {};

      return provider.getAuthFormSchema();
    }),
  auth: publicProcedure
    .input(
      z.object({
        passToServer: z.object({
          urlSearchParams: z.json(),
          formData: z.json().optional(),
        }),
      }),
    )
    .output(z.void())
    .mutation(async ({ ctx, input }) => {
      const {
        redisDB: { redis },
        prismaDB: { client: prisma },
        getCookie,
        setCookie,
        delCookie,
        pluginRegistry,
        helpers,
      } = ctx;
      const { passToServer } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });

      const preAuthSessionId = getCookie("preAuthSessionId") ?? "";
      const preAuthSessionKey = `auth:preAuth:session:${preAuthSessionId}`;
      delCookie("preAuthSessionId");

      const providerId = Number(
        await redis.hGet(preAuthSessionKey, "_providerId"),
      );

      if (!providerId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Provider ID not found in session",
        });

      const provider = await getServiceFromDBId<AuthProvider>(
        prisma,
        pluginRegistry,
        providerId,
      );

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      const {
        email,
        emailVerified,
        userName,
        providerIssuer,
        providedAccountId,
        sessionMeta,
        accountMeta,
      } = await provider.handleAuth(passToServer, helpers);

      const { userId, account } = await prisma.$transaction(async (tx) => {
        let account = await tx.account.findUnique({
          where: {
            provider_providedAccountId: {
              provider: providerIssuer,
              providedAccountId,
            },
          },
          include: {
            User: {
              select: {
                id: true,
              },
            },
          },
        });

        // 账户不存在
        // 用户可能存在
        if (!account) {
          account = await tx.account.create({
            data: {
              type: provider.getType(),
              provider: providerIssuer,
              providedAccountId,
              meta: z.json().parse(accountMeta) ?? {},
              User: {
                connectOrCreate: {
                  where: {
                    email,
                  },
                  create: {
                    name: userName,
                    email,
                    emailVerified,
                  },
                },
              },
            },
            include: {
              User: {
                select: {
                  id: true,
                },
              },
            },
          });
        }

        return {
          userId: account.User.id,
          account,
        };
      });

      const sessionId = randomBytes(32).toString("hex");
      const sessionKey = `user:session:${sessionId}`;

      await redis.hSet(sessionKey, {
        userId,
        provider: account.provider,
        providerType: account.type,
        providedAccountId: account.providedAccountId,
        _providerId: providerId,
        ...sessionMeta,
      });
      await redis.expire(sessionKey, 24 * 60 * 60);

      setCookie("sessionId", sessionId);
    }),
  logout: publicProcedure.output(z.void()).mutation(async ({ ctx }) => {
    const {
      prismaDB: { client: prisma },
      redisDB: { redis },
      user,
      sessionId,
      pluginRegistry,
      delCookie,
    } = ctx;

    if (!user || !sessionId)
      throw new TRPCError({ code: "CONFLICT", message: "Currently not login" });

    const sessionKey = `user:session:${sessionId}`;

    const providerId = Number(await redis.hGet(sessionKey, "_providerId"));

    if (!providerId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Provider ID not found in session",
      });

    const provider = await getServiceFromDBId<AuthProvider>(
      prisma,
      pluginRegistry,
      providerId,
    );

    if (!provider)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Auth Provider ${providerId} does not exists`,
      });

    if (typeof provider.handleLogout === "function") {
      await provider.handleLogout(sessionId);
    }

    await redis.del(`user:session:${sessionId}`);
    delCookie("sessionId");
  }),
});
