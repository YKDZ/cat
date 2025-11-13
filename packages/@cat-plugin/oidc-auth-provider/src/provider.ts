import { getDrizzleDB, getRedisDB, getSetting } from "@cat/db";
import type { AuthProvider, AuthResult, PreAuthResult } from "@cat/plugin-core";
import type { HTTPHelpers } from "@cat/shared/utils";
import { safeJoinURL } from "@cat/shared/utils";
import { createRemoteJWKSet, jwtVerify } from "jose";
import * as z from "zod/v4";
import { request, fetch } from "undici";
import { randomChars } from "./utils/crypto.ts";
import { createOIDCAuthURL } from "./utils/oidc.ts";
import { ProviderConfigSchema, type ProviderConfig } from "./index.ts";
import type { JSONType } from "@cat/shared/schema/json";

const SearchParasSchema = z.object({
  state: z.string(),
  code: z.string(),
});

export class Provider implements AuthProvider {
  private config: ProviderConfig;

  constructor(config: JSONType) {
    this.config = ProviderConfigSchema.parse(config);
  }

  getId(): string {
    return this.config.issuer;
  }

  getType(): string {
    return "OIDC";
  }

  getName(): string {
    return this.config.displayName;
  }

  getIcon(): string {
    return "icon-[mdi--ssh]";
  }

  async handlePreAuth(sessionId: string): Promise<PreAuthResult> {
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
  ): Promise<AuthResult> {
    const { redis } = await getRedisDB();
    const { client: drizzle } = await getDrizzleDB();

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
        await getSetting(drizzle, "server.url", "http://localhost:3000"),
        "/auth/callback",
      ),
      grant_type: "authorization_code",
    });

    const response = await request(this.config.tokenURI, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (response.statusCode !== 200) {
      throw new Error(`Failed to exchange token`);
    }

    const body = z
      .object({
        error: z.unknown().optional(),
        error_description: z.string(),
        id_token: z.string(),
      })
      .parse(await response.body.json());

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
    } = z
      .object({
        sub: z.string(),
        name: z.string(),
        preferred_username: z.string(),
        nickname: z.string(),
        email: z.string(),
        email_verified: z.boolean(),
        nonce: z.string(),
      })
      .parse(payload);

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

  async handleLogout(sessionId: string): Promise<void> {
    const { redis } = await getRedisDB();
    const { client: drizzle } = await getDrizzleDB();
    const idToken = await redis.hGet(`user:session:${sessionId}`, "idToken");

    if (!idToken) throw new Error("ID Token do not exists");

    const state = randomChars(32);
    const params = new URLSearchParams({
      id_token_hint: idToken,
      post_logout_redirect_uri: await getSetting(
        drizzle,
        "server.url",
        "http://localhost:3000",
      ),
      state,
    });

    const res = await fetch(`${this.config.logoutURI}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!res.ok) throw new Error("Error when oidc logout");
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
