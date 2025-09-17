import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { JSONSchemaSchema } from "@cat/shared/schema/json";
import { publicProcedure, router } from "@/server/trpc/server.ts";

export const authRouter = router({
  queryPreAuthFormSchema: publicProcedure
    .input(
      z.object({
        pluginId: z.string(),
        providerId: z.string(),
      }),
    )
    .output(JSONSchemaSchema)
    .query(async ({ ctx, input }) => {
      const {
        pluginRegistry,
        prismaDB: { client: prisma },
      } = ctx;
      const { providerId, pluginId } = input;

      const { service: provider } = (await pluginRegistry.getPluginService(
        prisma,
        pluginId,
        "AUTH_PROVIDER",
        providerId,
      ))!;

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      if (typeof provider.getPreAuthFormSchema !== "function") return {};

      return JSONSchemaSchema.parse(provider.getPreAuthFormSchema());
    }),
  preAuth: publicProcedure
    .input(
      z.object({
        pluginId: z.string(),
        providerId: z.string(),
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
      const { pluginId, providerId, gotFromClient } = input;

      if (user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

      const { service: provider } = (await pluginRegistry.getPluginService(
        prisma,
        pluginId,
        "AUTH_PROVIDER",
        providerId,
      ))!;

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
          _pluginId: pluginId,
          _providerId: providerId,
          ...sessionMeta,
        });

        setCookie("preAuthSessionId", sessionId);

        return passToClient;
      } else {
        const sessionKey = `auth:preAuth:session:${sessionId}`;
        await redis.hSet(sessionKey, {
          _pluginId: pluginId,
          _providerId: providerId,
        });

        setCookie("preAuthSessionId", sessionId);

        return null;
      }
    }),
  queryAuthFormSchema: publicProcedure
    .input(
      z.object({
        pluginId: z.string(),
        providerId: z.string(),
      }),
    )
    .output(JSONSchemaSchema)
    .query(async ({ ctx, input }) => {
      const {
        prismaDB: { client: prisma },
        pluginRegistry,
      } = ctx;
      const { pluginId, providerId } = input;

      const { service: provider } = (await pluginRegistry.getPluginService(
        prisma,
        pluginId,
        "AUTH_PROVIDER",
        providerId,
      ))!;

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      if (typeof provider.getAuthFormSchema !== "function") return {};
      return JSONSchemaSchema.parse(provider.getAuthFormSchema());
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

      const providerId = await redis.hGet(preAuthSessionKey, "_providerId");
      const pluginId = await redis.hGet(preAuthSessionKey, "_pluginId");

      if (!providerId || !pluginId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Provider ID not found in session",
        });

      const { service: provider } = (await pluginRegistry.getPluginService(
        prisma,
        pluginId,
        "AUTH_PROVIDER",
        providerId,
      ))!;

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
        _pluginId: pluginId,
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

    const providerId = await redis.hGet(sessionKey, "_providerId");
    const pluginId = await redis.hGet(sessionKey, "_pluginId");

    if (!providerId || !pluginId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Provider ID not found in session",
      });

    const { service: provider } = (await pluginRegistry.getPluginService(
      prisma,
      pluginId,
      "AUTH_PROVIDER",
      providerId,
    ))!;

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
