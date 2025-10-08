import { getDrizzleDB, getRedisDB, getSetting } from "@cat/db";
import type { ProviderConfig } from "..";
import { randomChars } from "./crypto.ts";

export const createOIDCSession = async (state: string, nonce: string) => {
  const { redis } = await getRedisDB();
  const sessionId = randomChars();
  const sessionKey = `auth:oidc:session:${sessionId}`;

  await redis.hSet(sessionKey, {
    state,
    nonce,
  });

  await redis.expire(sessionKey, 5 * 60);

  return sessionId;
};

export const createOIDCAuthURL = async (
  config: ProviderConfig,
  state: string,
  nonce: string,
): Promise<string> => {
  const { client: drizzle } = await getDrizzleDB();
  const redirecturi = new URL(
    "/auth/callback",
    await getSetting(drizzle, "server.url", "http://localhost:3000"),
  ).toString();

  const url = new URL("", config.authURI);
  url.searchParams.append("client_id", config.clientId ?? "");
  url.searchParams.append("redirect_uri", redirecturi);
  url.searchParams.append("response_type", "code");
  url.searchParams.append("scope", config.scopes ?? "");
  url.searchParams.append("state", state);
  url.searchParams.append("nonce", nonce);

  return url.toString();
};
