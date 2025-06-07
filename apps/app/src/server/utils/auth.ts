import { redis, setting } from "@cat/db";
import { randomBytes } from "crypto";
import type { HttpContext } from "../trpc/context";
import type { Account } from "@cat/shared";

export const createUserSession = async (
  userId: string,
  idToken: string,
  account: Account,
  ctx: HttpContext,
) => {
  const sessionId = randomBytes(32).toString("hex");
  const sessionKey = `user:session:${sessionId}`;

  await redis.hSet(sessionKey, {
    userId,
    idToken,
    provider: account.provider,
    providerType: account.type,
    providedAccountId: account.providedAccountId,
  });
  await redis.expire(sessionKey, 24 * 60 * 60);

  ctx.setCookie("sessionId", sessionId, 24 * 60 * 60);
};

export const createOIDCSession = async (
  state: string,
  nonce: string,
  ctx: HttpContext,
) => {
  const oidcSession = randomBytes(32).toString("hex");
  const sessionKey = `auth:oidc:session:${oidcSession}`;

  await redis.hSet(sessionKey, {
    state,
    nonce,
  });

  await redis.expire(sessionKey, 60);
  ctx.setCookie("oidcSessionId", oidcSession, 60);
};

export const createOIDCAuthURL = async (
  state: string,
  nonce: string,
): Promise<string> => {
  const redirecturi = new URL(
    "/auth/oidc.callback",
    (await setting("server.url", "http://localhost:3000")) as string,
  ).toString();

  const url = new URL("", process.env.OIDC_AUTH_URI);
  url.searchParams.append("client_id", process.env.OIDC_CLIENT_ID ?? "");
  url.searchParams.append("redirect_uri", redirecturi);
  url.searchParams.append("response_type", "code");
  url.searchParams.append("scope", process.env.OIDC_SCOPES ?? "");
  url.searchParams.append("state", state);
  url.searchParams.append("nonce", nonce);

  return url.toString();
};

export const randomChars = (size: number = 16) => {
  return randomBytes(size).toString("hex");
};
