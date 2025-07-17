import { prisma, redis } from "@cat/db";
import { AuthMethodSchema, type AuthMethod } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { publicProcedure, router } from "../server";
import type { JSONSchema } from "zod/v4/core";

export const authRouter = router({
  queryPreAuthFormSchema: publicProcedure
    .input(
      z.object({
        providerId: z.string(),
      }),
    )
    .output(z.custom<JSONSchema.JSONSchema>())
    .query(async ({ ctx, input }) => {
      const { pluginRegistry } = ctx;
      const { providerId } = input;

      const provider = pluginRegistry
        .getAuthProviders()
        .find((provider) => provider.getId() === providerId);

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
        providerId: z.string(),
        gotFromClient: z.object({
          formData: z.json().optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { user, pluginRegistry, setCookie, helpers } = ctx;
      const { providerId, gotFromClient } = input;

      if (user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

      const provider = pluginRegistry
        .getAuthProviders()
        .find((provider) => provider.getId() === providerId);

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
        providerId: z.string(),
      }),
    )
    .output(z.custom<JSONSchema.JSONSchema>())
    .query(async ({ ctx, input }) => {
      const { pluginRegistry } = ctx;
      const { providerId } = input;

      const provider = pluginRegistry
        .getAuthProviders()
        .find((provider) => provider.getId() === providerId);

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
    .mutation(async ({ ctx, input }) => {
      const { getCookie, setCookie, delCookie, pluginRegistry, helpers } = ctx;
      const { passToServer } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });

      const preAuthSessionId = getCookie("preAuthSessionId") ?? "";
      const preAuthSessionKey = `auth:preAuth:session:${preAuthSessionId}`;
      delCookie("preAuthSessionId");

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
              meta: accountMeta,
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

    if (typeof provider.handleLogout === "function") {
      await provider.handleLogout(sessionId);
    }

    await redis.del(`user:session:${sessionId}`);
    delCookie("sessionId");
  }),
  availableAuthMethod: publicProcedure
    .output(z.array(AuthMethodSchema))
    .query(async ({ ctx }) => {
      const { pluginRegistry } = ctx;
      return pluginRegistry.getAuthProviders().map(
        (provider) =>
          ({
            providerId: provider.getId(),
            providerType: provider.getType(),
            name: provider.getName(),
            icon: "i-mdi:ssh",
          }) satisfies AuthMethod,
      );
    }),
});
