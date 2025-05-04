import { prisma } from "@cat/db";
import { redis } from "@/server/database/redis";
import { AuthMethod, AuthMethodType, PrismaError } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { publicProcedure, router } from "../server";

export const OIDC_REDIRECT_URL = new URL(
  "/auth/oidc.callback",
  import.meta.env.URL,
).toString();

const oidcRouter = router({
  init: publicProcedure.query(async ({ input, ctx }) => {
    if (!import.meta.env.OIDC_CLIENT_ID)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Environment variable OIDC_CLIENT_ID is not set",
      });

    if (ctx.user)
      throw new TRPCError({ code: "CONFLICT", message: "Already login" });

    const state = randomBytes(16).toString("hex");
    const nonce = randomBytes(16).toString("hex");
    const searchParams = new URLSearchParams({
      client_id: import.meta.env.OIDC_CLIENT_ID,
      redirect_uri: OIDC_REDIRECT_URL,
      response_type: "code",
      scope: import.meta.env.OIDC_SCOPES ?? "",
      state,
      nonce,
    });

    const oidcSession = randomBytes(32).toString("hex");
    const sessionKey = `auth:oidc:session:${oidcSession}`;
    await redis.hSet(sessionKey, {
      state,
      nonce,
    });
    await redis.expire(sessionKey, 60);
    ctx.setCookie("oidcSessionId", oidcSession, 60);

    return {
      authURL: `${import.meta.env.OIDC_AUTH_URI}?${searchParams}`,
    };
  }),
  callback: publicProcedure
    .input(
      z.object({
        state: z.string(),
        code: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already login" });

      const { state, code } = input;

      const oidcSessionId = ctx.getCookie("oidcSessionId");
      if (!oidcSessionId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OIDC Session not found in cookie",
        });
      const oidcSessionKey = `auth:oidc:session:${oidcSessionId}`;
      const { state: storedState, nonce: storedNonce } =
        await redis.hGetAll(oidcSessionKey);
      await redis.del(oidcSessionKey);
      if (!storedState || storedState !== state || !storedNonce)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "State do not match",
        });
      ctx.delCookie("oidcSessionId");

      const params = new URLSearchParams({
        client_id: import.meta.env.OIDC_CLIENT_ID ?? "",
        client_secret: import.meta.env.OIDC_CLIENT_SECRET ?? "",
        code,
        redirect_uri: OIDC_REDIRECT_URL,
        grant_type: "authorization_code",
      });

      const response = await fetch(import.meta.env.OIDC_TOKEN_URI ?? "", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params,
      });

      if (!response.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to exchange token`,
        });
      }

      const body = await response.json();

      if (body.error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to exchange token: ${body.error_description}`,
        });
      }

      const { id_token: idToken } = body;

      const JWKS = createRemoteJWKSet(
        new URL(import.meta.env.OIDC_JWKS_URI ?? ""),
      );

      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: import.meta.env.OIDC_ISSUER,
        audience: import.meta.env.OIDC_CLIENT_ID,
      });

      const {
        sub,
        name,
        preferred_username,
        nickname,
        email,
        email_verified,
        nonce,
      } = payload as {
        sub: string;
        name: string;
        preferred_username: string;
        nickname: string;
        email: string;
        email_verified: boolean;
        nonce: string;
      };

      if (nonce !== storedNonce)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NONCE do not match",
        });

      // 所有验证完成
      // 进入签发会话阶段
      const account = await prisma.account
        .findFirstOrThrow({
          where: {
            // TODO 支持多 OIDC 源
            type: "OIDC",
            provider: "OIDC",
            providedAccountId: sub,
          },
          include: {
            User: true,
          },
        })
        .catch(async (e: PrismaError) => {
          // 不存在则自动创建账户和用户
          if (e.code === "P2025") {
            return await prisma.account.create({
              data: {
                type: "OIDC",
                provider: "OIDC",
                providedAccountId: sub,
                User: {
                  create: {
                    name: preferred_username ?? nickname ?? name,
                    email,
                    emailVerified: email_verified,
                  },
                },
              },
              include: {
                User: true,
              },
            });
          } else throw e;
        });

      const sessionId = randomBytes(32).toString("hex");
      const sessionKey = `user:session:${sessionId}`;

      await redis.hSet(sessionKey, {
        userId: account.User.id,
        idToken,
        provider: account.provider,
        providerType: account.type,
        providedAccountId: account.providedAccountId,
      });
      await redis.expire(sessionKey, 24 * 60 * 60);

      ctx.setCookie("sessionId", sessionId, 24 * 60 * 60);
    }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const { user, sessionId } = ctx;

    if (!ctx.user || !ctx.sessionId)
      throw new TRPCError({ code: "CONFLICT", message: "Currently not login" });

    const idToken = await redis.hGet(`user:session:${sessionId}`, "idToken");

    if (!idToken)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "ID Token 不存在",
      });

    const state = randomBytes(16).toString("hex");
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: import.meta.env.URL!,
      state,
    });

    const res = await fetch(`${import.meta.env.OIDC_LOGOUT_URI}?${params}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "登出时出现错误",
      });

    await redis.del(`user:session:${sessionId}`);
    ctx.delCookie("sessionId");
  }),
});

const miscRouter = router({
  availableAuthMethod: publicProcedure.query(async ({ input, ctx }) => {
    const result: AuthMethod[] = [];
    if (import.meta.env.OIDC_CLIENT_ID)
      result.push({
        type: AuthMethodType.OIDC,
        title: import.meta.env.OIDC_DISPLAY_NAME ?? "OIDC Provider",
      });
    return result;
  }),
});

export const authRouter = router({
  oidc: oidcRouter,
  misc: miscRouter,
});
