import { prisma, redis } from "@cat/db";
import { AuthMethodSchema, type AuthMethod } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { z } from "zod/v4";
import { publicProcedure, router } from "../server";

export const authRouter = router({
  preAuth: publicProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { user, pluginRegistry, setCookie, helpers } = ctx;
      const { providerId } = input;

      if (user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

      if (!process.env.OIDC_CLIENT_ID)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Environment variable OIDC_CLIENT_ID is not set",
        });

      const provider = pluginRegistry
        .getAuthProviders()
        .find((provider) => provider.getId() === providerId);

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      if (!provider.needPreAuth()) return {};

      const { sessionId, passToClient, sessionMeta } =
        await provider.handlePreAuth!(null, helpers);

      const sessionKey = `auth:preAuth:session:${sessionId}`;
      await redis.hSet(sessionKey, { _providerId: providerId, ...sessionMeta });

      setCookie("preAuthSessionId", sessionId);

      return passToClient;
    }),
  auth: publicProcedure
    .input(
      z.object({
        passToServer: z.json(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { getCookie, setCookie, pluginRegistry, helpers } = ctx;
      const { passToServer } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });

      const preAuthSessionId = getCookie("preAuthSessionId") ?? "";
      const preAuthSessionKey = `auth:preAuth:session:${preAuthSessionId}`;

      const providerId = await redis.hGet(preAuthSessionKey, "_providerId");

      if (!providerId)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Provider ID not found in session",
        });

      const provider = pluginRegistry
        .getAuthProviders()
        .find((provider) => provider.getId() === providerId);

      if (!provider)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Auth Provider ${providerId} does not exists`,
        });

      const { userName, providerIssuer, providedAccountId, sessionMeta } =
        await provider.handleAuth(passToServer, helpers);

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
              User: {
                connectOrCreate: {
                  where: {
                    name: userName,
                  },
                  create: {
                    name: userName,
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
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const { user, sessionId, pluginRegistry, delCookie } = ctx;

    if (!user || !sessionId)
      throw new TRPCError({ code: "CONFLICT", message: "Currently not login" });

    const sessionKey = `user:session:${sessionId}`;

    const providerId = await redis.hGet(sessionKey, "_providerId");

    if (!providerId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Provider ID not found in session",
      });

    const provider = pluginRegistry
      .getAuthProviders()
      .find((provider) => provider.getId() === providerId);

    if (!provider)
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Auth Provider ${providerId} does not exists`,
      });

    await provider.handleLogout(sessionId);

    await redis.del(`user:session:${sessionId}`);
    delCookie("sessionId");
  }),
  availableAuthMethod: publicProcedure
    .output(z.array(AuthMethodSchema))
    .query(async () => {
      const result: AuthMethod[] = [
        {
          id: "OIDC",
          type: "OIDC",
          name: "Forest SSO",
          icon: "i-mdi:ssh",
        },
      ];
      return result;
    }),
});
