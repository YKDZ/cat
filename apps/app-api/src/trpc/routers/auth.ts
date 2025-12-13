import { randomBytes } from "node:crypto";
import { TRPCError } from "@trpc/server";
import * as z from "zod/v4";
import { JSONSchemaSchema } from "@cat/shared/schema/json";
import type { AuthProvider } from "@cat/plugin-core";
import { getServiceFromDBId } from "@cat/app-server-shared/utils";
import { account as accountTable, user as userTable } from "@cat/db";
import { assertSingleNonNullish } from "@cat/shared/utils";
import { authedProcedure, publicProcedure, router } from "@/trpc/server.ts";

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
        drizzleDB: { client: drizzle },
      } = ctx;
      const { providerId } = input;

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
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
        drizzleDB: { client: drizzle },
        user,
        pluginRegistry,
        helpers,
        helpers: { setCookie },
      } = ctx;
      const { providerId, gotFromClient } = input;

      if (user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
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
        drizzleDB: { client: drizzle },
        pluginRegistry,
      } = ctx;
      const { providerId } = input;

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
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
        drizzleDB: { client: drizzle },
        helpers,
        pluginRegistry,
      } = ctx;
      const { passToServer } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });

      const preAuthSessionId = helpers.getCookie("preAuthSessionId");

      if (!preAuthSessionId)
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Pre-auth session ID not found",
        });

      const preAuthSessionKey = `auth:preAuth:session:${preAuthSessionId}`;
      helpers.delCookie("preAuthSessionId");

      const providerId = z.coerce
        .number()
        .parse(await redis.hGet(preAuthSessionKey, "_providerId"));

      const provider = await getServiceFromDBId<AuthProvider>(
        drizzle,
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

      const { userId, account } = await drizzle.transaction(async (tx) => {
        let account = await tx.query.account.findFirst({
          where: (account, { and, eq }) =>
            and(
              eq(account.provider, providerIssuer),
              eq(account.providedAccountId, providedAccountId),
            ),
          columns: {
            userId: true,
            provider: true,
            type: true,
            providedAccountId: true,
          },
        });

        // 账户不存在
        // 用户可能存在
        if (!account) {
          let user = await tx.query.user.findFirst({
            where: (user, { eq }) => eq(user.email, email),
            columns: {
              id: true,
            },
          });

          if (!user) {
            user = assertSingleNonNullish(
              await tx
                .insert(userTable)
                .values({
                  name: userName,
                  email,
                  emailVerified,
                })
                .returning({ id: userTable.id }),
            );
          }

          account = assertSingleNonNullish(
            await tx
              .insert(accountTable)
              .values({
                type: provider.getType(),
                provider: providerIssuer,
                providedAccountId,
                meta: z.json().parse(accountMeta) ?? {},
                userId: user.id,
              })
              .returning({
                userId: accountTable.userId,
                provider: accountTable.provider,
                type: accountTable.type,
                providedAccountId: accountTable.providedAccountId,
              }),
          );
        }

        return {
          userId: account.userId,
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

      helpers.setCookie("sessionId", sessionId);
    }),
  logout: authedProcedure.output(z.void()).mutation(async ({ ctx }) => {
    const {
      drizzleDB: { client: drizzle },
      redisDB: { redis },
      sessionId,
      pluginRegistry,
      helpers,
    } = ctx;

    const sessionKey = `user:session:${sessionId}`;

    const providerId = Number(await redis.hGet(sessionKey, "_providerId"));

    if (!providerId)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Provider ID not found in session",
      });

    const provider = await getServiceFromDBId<AuthProvider>(
      drizzle,
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
    helpers.delCookie("sessionId");
  }),
});
