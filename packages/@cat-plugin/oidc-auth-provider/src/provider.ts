import { redis, setting } from "@cat/db";
import type { AuthProvider, AuthResult, PreAuthResult } from "@cat/plugin-core";
import type { HTTPHelpers } from "@cat/shared";
import { safeJoinURL } from "@cat/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomChars } from "./utils/crypto";
import { createOIDCAuthURL } from "./utils/oidc";

const getRedirectURL = async () =>
  safeJoinURL(
    await setting("server.url", "http://localhost:3000"),
    "/auth/oidc.callback",
  );

export class Provider implements AuthProvider {
  getId() {
    return "OIDC";
  }

  getType() {
    return "OIDC";
  }

  needPreAuth() {
    return true;
  }

  async handlePreAuth() {
    if (!process.env.OIDC_CLIENT_ID)
      throw new Error("Environment variable OIDC_CLIENT_ID is not set");

    const state = randomChars();
    const nonce = randomChars();
    const sessionId = randomChars();

    const authURL = await createOIDCAuthURL(state, nonce);

    return {
      sessionId: sessionId,
      passToClient: {
        authURL,
      },
      sessionMeta: { state, nonce },
    } satisfies PreAuthResult;
  }

  async handleAuth(
    gotFromClient: unknown,
    { getCookie, delCookie }: HTTPHelpers,
  ) {
    if (
      !gotFromClient ||
      typeof gotFromClient !== "object" ||
      !("state" in gotFromClient) ||
      !("code" in gotFromClient) ||
      typeof gotFromClient.code !== "string" ||
      typeof gotFromClient.state !== "string"
    ) {
      throw new Error();
    }

    const { state, code } = gotFromClient;

    // 验证 OIDC 会话
    const preAuthSessionId = getCookie("preAuthSessionId");
    if (!preAuthSessionId) throw new Error("OIDC Session not found in cookie");
    const oidcSessionKey = `auth:preAuth:session:${preAuthSessionId}`;
    const { state: storedState, nonce: storedNonce } =
      await redis.hGetAll(oidcSessionKey);
    await redis.del(oidcSessionKey);

    // 验证 State
    if (!storedState || storedState !== state || !storedNonce)
      throw new Error("State do not match");
    delCookie("preAuthSessionId");

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
      throw new Error(`Failed to exchange token`);
    }

    const body = await response.json();

    if (body.error) {
      throw new Error(`Failed to exchange token: ${body.error_description}`);
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
    if (nonce !== storedNonce) throw new Error("NONCE do not match");

    // 所有验证完成
    return {
      userName: preferredUserName ?? nickname ?? name,
      providerIssuer: process.env.OIDC_ISSUER!,
      providedAccountId: sub,
      sessionMeta: {
        idToken,
      },
    } satisfies AuthResult;
  }

  async handleLogout(sessionId: string) {
    const idToken = await redis.hGet(`user:session:${sessionId}`, "idToken");

    if (!idToken) throw new Error("ID Token 不存在");

    const state = randomChars(32);
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: await setting(
        "server.url",
        "http://localhost:3000",
      ),
      state,
    });

    const res = await fetch(`${process.env.OIDC_LOGOUT_URI}?${params}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) throw new Error("登出时出现错误");
  }
}
