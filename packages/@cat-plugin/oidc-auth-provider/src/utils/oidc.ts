import type { SessionStore } from "@cat/domain";

import type { ProviderConfig } from "..";

import { randomChars } from "./crypto.ts";

export const createOIDCSession = async (
  sessionStore: SessionStore,
  state: string,
  nonce: string,
): Promise<string> => {
  const sessionId = randomChars();
  await sessionStore.create(
    `auth:oidc:session:${sessionId}`,
    { state, nonce },
    5 * 60,
  );

  return sessionId;
};

export const createOIDCAuthURL = async (
  config: ProviderConfig,
  state: string,
  nonce: string,
  serverUrl: string,
): Promise<string> => {
  const redirecturi = new URL("/auth/callback", serverUrl).toString();

  const url = new URL("", config.authURI);
  url.searchParams.append("client_id", config.clientId ?? "");
  url.searchParams.append("redirect_uri", redirecturi);
  url.searchParams.append("response_type", "code");
  url.searchParams.append("scope", config.scopes ?? "");
  url.searchParams.append("state", state);
  url.searchParams.append("nonce", nonce);

  return url.toString();
};
