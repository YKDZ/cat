import { getPrismaDB, getRedisDB, setting } from "@cat/db";
import type { AuthProvider, AuthResult, PreAuthResult } from "@cat/plugin-core";
import type { HTTPHelpers } from "@cat/shared";
import { safeJoinURL } from "@cat/shared";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomChars } from "./utils/crypto";
import { createOIDCAuthURL } from "./utils/oidc";
import type { ProviderConfig } from ".";
import { z } from "zod";

const SearchParasSchema = z.object({
  state: z.string(),
  code: z.string(),
});

export class Provider implements AuthProvider {
  private config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  getId() {
    return this.config.issuer;
  }

  getType() {
    return "OIDC";
  }

  getName() {
    return this.config.displayName;
  }

  async handlePreAuth(sessionId: string) {
    if (!this.config.clientId) throw new Error("Config invalid");

    const state = randomChars();
    const nonce = randomChars();

    const redirectURL = await createOIDCAuthURL(this.config, state, nonce);

    return {
      sessionId: sessionId,
      passToClient: {
        redirectURL,
      },
      sessionMeta: { state, nonce },
    } satisfies PreAuthResult;
  }

  async handleAuth(
    gotFromClient: {
      urlSearchParams?: unknown;
    },
    { getCookie, delCookie }: HTTPHelpers,
  ) {
    const { redis } = await getRedisDB();
    const { client: prisma } = await getPrismaDB();

    const { state, code } = SearchParasSchema.parse(
      gotFromClient.urlSearchParams,
    );

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
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      code,
      redirect_uri: safeJoinURL(
        await setting("server.url", "http://localhost:3000", prisma),
        "/auth/callback",
      ),
      grant_type: "authorization_code",
    });

    const response = await fetch(this.config.tokenURI, {
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

    const JWKS = createRemoteJWKSet(new URL(this.config.jwksURI));

    const { payload } = await jwtVerify(idToken, JWKS, {
      issuer: this.config.issuer,
      audience: this.config.clientId,
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
      email,
      emailVerified,
      userName: preferredUserName ?? nickname ?? name,
      providerIssuer: this.config.issuer,
      providedAccountId: sub,
      sessionMeta: {
        idToken,
      },
    } satisfies AuthResult;
  }

  async handleLogout(sessionId: string) {
    const { redis } = await getRedisDB();
    const { client: prisma } = await getPrismaDB();
    const idToken = await redis.hGet(`user:session:${sessionId}`, "idToken");

    if (!idToken) throw new Error("ID Token do not exists");

    const state = randomChars(32);
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: await setting(
        "server.url",
        "http://localhost:3000",
        prisma,
      ),
      state,
    });

    const res = await fetch(`${this.config.logoutURI}?${params}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) throw new Error("Error when oidc logout");
  }

  async isAvaliable() {
    return true;
  }
}
