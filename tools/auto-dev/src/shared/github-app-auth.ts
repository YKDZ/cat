import { execFileSync } from "node:child_process";
import jwt from "jsonwebtoken";

export interface InstallationToken {
  token: string;
  expiresAt: Date;
}

let cachedToken: InstallationToken | null = null;
const EXPIRY_BUFFER_MS = 5 * 60 * 1000; // 5 min before actual expiry

const generateJwt = (appId: string, privateKey: string): string => {
  const now = Math.floor(Date.now() / 1000);
  return jwt.sign(
    { iat: now - 60, exp: now + 600, iss: appId },
    privateKey.replace(/\\n/g, "\n"),
    { algorithm: "RS256" },
  );
};

export const getInstallationToken = (): string => {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error(
      "Missing GitHub App configuration: GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, and GITHUB_APP_INSTALLATION_ID are required.",
    );
  }

  if (cachedToken && Date.now() < cachedToken.expiresAt.getTime() - EXPIRY_BUFFER_MS) {
    return cachedToken.token;
  }

  const appJwt = generateJwt(appId, privateKey);
  try {
    const response = execFileSync(
      "gh",
      ["api", `app/installations/${installationId}/access_tokens`, "--method", "POST", "--jq", ".token"],
      { encoding: "utf-8", env: { ...process.env, GITHUB_TOKEN: appJwt, GH_TOKEN: appJwt } },
    ).trim();

    if (!response) throw new Error("Empty token response from GitHub API");

    cachedToken = {
      token: response,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    };
    return cachedToken.token;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Failed to obtain GitHub App installation token: ${message}`);
  }
};

export const clearTokenCache = (): void => {
  cachedToken = null;
};

export const getAuthEnv = (): Record<string, string> => {
  const token = getInstallationToken();
  return { GITHUB_TOKEN: token, GH_TOKEN: token };
};
