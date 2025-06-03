import { prisma, redis, setting } from "@cat/db";
import { AuthMethod, AuthMethodType } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { randomBytes } from "crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod/v4";
import { publicProcedure, router } from "../server";
import {
  createOIDCAuthURL,
  createOIDCSession,
  createUserSession,
  randomChars,
} from "@/server/utils/auth";

const getRedirectURL = async () =>
  new URL(
    "/auth/oidc.callback",
    (await setting("server.url", "http://localhost:3000")) as string,
  ).toString();

const oidcRouter = router({
  init: publicProcedure.query(async ({ ctx }) => {
    const { user } = ctx;

    if (!process.env.OIDC_CLIENT_ID)
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Environment variable OIDC_CLIENT_ID is not set",
      });

    if (user)
      throw new TRPCError({ code: "CONFLICT", message: "Already login" });

    const state = randomChars();
    const nonce = randomChars();

    const authURL = await createOIDCAuthURL(state, nonce);

    await createOIDCSession(state, nonce, ctx);

    return {
      authURL,
    };
  }),
  callback: publicProcedure
    .input(
      z.object({
        state: z.string(),
        code: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { getCookie } = ctx;
      const { state, code } = input;

      if (ctx.user)
        throw new TRPCError({ code: "CONFLICT", message: "Already logged in" });

      // 验证 OIDC 会话
      const oidcSessionId = getCookie("oidcSessionId");
      if (!oidcSessionId)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "OIDC Session not found in cookie",
        });
      const oidcSessionKey = `auth:oidc:session:${oidcSessionId}`;
      const { state: storedState, nonce: storedNonce } =
        await redis.hGetAll(oidcSessionKey);
      await redis.del(oidcSessionKey);

      // 验证 State
      if (!storedState || storedState !== state || !storedNonce)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "State do not match",
        });
      ctx.delCookie("oidcSessionId");

      // 请求 Token
      const params = new URLSearchParams({
        client_id: process.env.OIDC_CLIENT_ID ?? "",
        client_secret: process.env.OIDC_CLIENT_SECRET ?? "",
        code,
        redirect_uri: await getRedirectURL(),
        grant_type: "authorization_code",
      });

      const response = await fetch(process.env.OIDC_TOKEN_URI ?? "", {
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

      // 验证 ID Token
      const { id_token: idToken } = body;

      const JWKS = createRemoteJWKSet(new URL(process.env.OIDC_JWKS_URI ?? ""));

      const { payload } = await jwtVerify(idToken, JWKS, {
        issuer: process.env.OIDC_ISSUER,
        audience: process.env.OIDC_CLIENT_ID,
      });

      // 解析 ID Token 携带的信息
      const {
        sub,
        name,
        preferred_username: preferredUserName,
        nickname,
        email,
        email_verified: emailVerified,
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

      // 验证 Nonce
      if (nonce !== storedNonce)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "NONCE do not match",
        });

      // 所有验证完成
      // 进入签发会话阶段
      const { user, account } = await prisma.$transaction(async (tx) => {
        const user =
          // 用户不存在则创建
          (await tx.user.findUnique({
            where: {
              email,
            },
            select: {
              id: true,
              Accounts: {
                where: {
                  type: "OIDC",
                  provider: process.env.OIDC_ISSUER!,
                  providedAccountId: sub,
                },
              },
            },
          })) ??
          (await tx.user.create({
            data: {
              name: preferredUserName ?? nickname ?? name,
              email,
              emailVerified: emailVerified,
              Accounts: {
                create: {
                  type: "OIDC",
                  provider: process.env.OIDC_ISSUER!,
                  providedAccountId: sub,
                },
              },
            },
            select: {
              id: true,
              Accounts: {
                where: {
                  type: "OIDC",
                  provider: process.env.OIDC_ISSUER!,
                  providedAccountId: sub,
                },
              },
            },
          }));

        let account = user.Accounts[0];

        // 用户存在但 Account 不存在
        // 代表用户之前可能通过其他途径登录
        // 创建 OIDC Account
        if (!user.Accounts[0]) {
          account = await tx.account.create({
            data: {
              type: "OIDC",
              provider: process.env.OIDC_ISSUER!,
              providedAccountId: sub,
              User: {
                connect: {
                  id: user.id,
                },
              },
            },
          });
        }

        return { user, account };
      });

      await createUserSession(user.id, idToken, account, ctx);
    }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    const { sessionId } = ctx;

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
      post_logout_redirect_uri: (await setting(
        "server.url",
        "http://localhost:3000",
      )) as string,
      state,
    });

    const res = await fetch(`${process.env.OIDC_LOGOUT_URI}?${params}`, {
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
  availableAuthMethod: publicProcedure.query(async () => {
    const result: AuthMethod[] = [];
    if (process.env.OIDC_CLIENT_ID)
      result.push({
        type: AuthMethodType.OIDC,
        title: process.env.OIDC_DISPLAY_NAME ?? "OIDC Provider",
      });
    return result;
  }),
});

export const authRouter = router({
  oidc: oidcRouter,
  misc: miscRouter,
});
